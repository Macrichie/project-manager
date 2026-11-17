import json
from copy import deepcopy
from time import time

import pytest
from fastapi.testclient import TestClient

from app.auth import COOKIE_NAME, SESSION_SECONDS, hash_password
from app.database import SEED_PATH

CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def signed_in(client):
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 200
    return client


def test_new_user_has_one_default_board(signed_in):
    response = signed_in.get("/api/boards")
    assert response.status_code == 200
    boards = response.json()
    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"
    assert "id" in boards[0]
    assert "card_count" in boards[0]
    assert boards[0]["card_count"] == 10  # seed data has 10 cards


def test_create_board_returns_board_meta(signed_in):
    response = signed_in.post("/api/boards", json={"name": "Sprint 1", "description": "First sprint"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Sprint 1"
    assert data["description"] == "First sprint"
    assert "id" in data
    # Should now have 2 boards
    boards = signed_in.get("/api/boards").json()
    assert len(boards) == 2


def test_create_board_blank_name_returns_422(signed_in):
    response = signed_in.post("/api/boards", json={"name": "  "})
    assert response.status_code == 422


def test_read_board_by_id(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    response = signed_in.get(f"/api/boards/{board_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["revision"] == 1
    assert len(data["board"]["columns"]) == 5


def test_save_board_by_id_with_revision(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    document = signed_in.get(f"/api/boards/{board_id}").json()
    document["board"]["columns"][0]["name"] = "Changed"
    response = signed_in.put(f"/api/boards/{board_id}", json=document)
    assert response.status_code == 200
    assert response.json()["revision"] == 2
    assert response.json()["board"]["columns"][0]["name"] == "Changed"


def test_delete_board(signed_in):
    created = signed_in.post("/api/boards", json={"name": "Temp"}).json()
    response = signed_in.delete(f"/api/boards/{created['id']}")
    assert response.status_code == 204
    assert signed_in.get(f"/api/boards/{created['id']}").status_code == 404


def test_cannot_delete_last_board(signed_in):
    boards = signed_in.get("/api/boards").json()
    assert len(boards) == 1
    response = signed_in.delete(f"/api/boards/{boards[0]['id']}")
    assert response.status_code == 400


def test_cannot_access_other_users_board(signed_in):
    database = signed_in.app.state.database
    other = database.register_user("other", hash_password("pass"), "Other")
    other_board = database.create_board(other["id"], "Private", "")
    response = signed_in.get(f"/api/boards/{other_board['id']}")
    assert response.status_code == 404


def test_cannot_write_other_users_board(signed_in):
    database = signed_in.app.state.database
    other = database.register_user("writer", hash_password("pass"), "Writer")
    other_board = database.create_board(other["id"], "Their Board", "")
    # Read the board as other user to get revision
    other_doc = database.read_board(other["id"], other_board["id"])
    doc = other_doc.model_dump()
    doc["board"]["columns"][0]["name"] = "Hacked"
    response = signed_in.put(f"/api/boards/{other_board['id']}", json=doc)
    assert response.status_code == 404


def test_conflict_detection_on_board_save(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    stale = signed_in.get(f"/api/boards/{board_id}").json()
    latest = deepcopy(stale)
    latest["board"]["columns"][0]["name"] = "Saved first"
    signed_in.put(f"/api/boards/{board_id}", json=latest)
    response = signed_in.put(f"/api/boards/{board_id}", json=stale)
    assert response.status_code == 409


def test_legacy_board_endpoint_reads_first_board(signed_in):
    response = signed_in.get("/api/board")
    assert response.status_code == 200
    boards = signed_in.get("/api/boards").json()
    board_response = signed_in.get(f"/api/boards/{boards[0]['id']}").json()
    assert response.json() == board_response


def test_legacy_board_endpoint_saves_first_board(signed_in):
    document = signed_in.get("/api/board").json()
    document["board"]["columns"][0]["name"] = "Legacy Save"
    response = signed_in.put("/api/board", json=document)
    assert response.status_code == 200
    assert response.json()["board"]["columns"][0]["name"] == "Legacy Save"


def test_boards_require_session(client):
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "Test"}).status_code == 401


def test_card_with_labels_and_priority_round_trips(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    document = signed_in.get(f"/api/boards/{board_id}").json()
    document["board"]["columns"][0]["cards"].append({
        "id": "enhanced-card",
        "title": "Enhanced card",
        "details": "With metadata",
        "labels": ["bug", "urgent"],
        "due_date": "2026-12-01",
        "priority": "high",
    })
    response = signed_in.put(f"/api/boards/{board_id}", json=document)
    assert response.status_code == 200
    card = response.json()["board"]["columns"][0]["cards"][-1]
    assert card["labels"] == ["bug", "urgent"]
    assert card["due_date"] == "2026-12-01"
    assert card["priority"] == "high"


def test_card_without_new_fields_still_works(signed_in):
    """Cards saved before enhancement (no labels/due_date/priority) must deserialize fine."""
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    document = signed_in.get(f"/api/boards/{board_id}").json()
    # Existing seed cards have only id/title/details — verify they work
    card = document["board"]["columns"][0]["cards"][0]
    assert "id" in card
    assert "title" in card
    # New fields should have defaults
    assert card.get("labels", []) == []
    assert card.get("priority", "none") == "none"


def test_invalid_priority_rejected(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    document = signed_in.get(f"/api/boards/{board_id}").json()
    document["board"]["columns"][0]["cards"][0]["priority"] = "critical"
    response = signed_in.put(f"/api/boards/{board_id}", json=document)
    assert response.status_code == 422


def test_rename_board(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    response = signed_in.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    # Verify it persisted
    boards = signed_in.get("/api/boards").json()
    assert boards[0]["name"] == "Renamed"


def test_update_board_description(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    response = signed_in.patch(f"/api/boards/{board_id}", json={"description": "Updated desc"})
    assert response.status_code == 200
    assert response.json()["description"] == "Updated desc"


def test_rename_board_blank_name_returns_422(signed_in):
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    response = signed_in.patch(f"/api/boards/{board_id}", json={"name": "  "})
    assert response.status_code == 422


def test_rename_nonexistent_board_returns_404(signed_in):
    response = signed_in.patch("/api/boards/99999", json={"name": "Nope"})
    assert response.status_code == 404


def test_cannot_rename_other_users_board(signed_in):
    database = signed_in.app.state.database
    other = database.register_user("renamer", hash_password("pass"), "Renamer")
    other_board = database.create_board(other["id"], "Their Board", "")
    response = signed_in.patch(f"/api/boards/{other_board['id']}", json={"name": "Stolen"})
    assert response.status_code == 404


def test_chat_with_board_id(signed_in):
    """Chat endpoint should work with board_id path parameter."""
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    # Without AI config, should return appropriate error
    response = signed_in.post(f"/api/boards/{board_id}/chat", json={
        "message": "Hello"
    })
    # Should be 503 (no AI configured) not 404
    assert response.status_code in (503, 502)
