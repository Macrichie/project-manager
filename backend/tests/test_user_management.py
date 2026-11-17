"""Tests for user management features across the multi-board system."""
import pytest
from app.auth import COOKIE_NAME, hash_password


CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def signed_in(client):
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 200
    return client


def test_registered_user_has_separate_boards(client):
    """Each registered user gets their own independent board."""
    # Register two users
    client.post("/api/auth/register", json={
        "username": "alice", "password": "password123", "display_name": "Alice"
    })
    alice_boards = client.get("/api/boards").json()
    client.post("/api/auth/logout")

    client.post("/api/auth/register", json={
        "username": "bob", "password": "password123", "display_name": "Bob"
    })
    bob_boards = client.get("/api/boards").json()

    assert len(alice_boards) == 1
    assert len(bob_boards) == 1
    assert alice_boards[0]["id"] != bob_boards[0]["id"]


def test_user_can_create_multiple_boards(signed_in):
    """A user can create many boards."""
    for i in range(5):
        response = signed_in.post("/api/boards", json={"name": f"Board {i}"})
        assert response.status_code == 201
    boards = signed_in.get("/api/boards").json()
    assert len(boards) == 6  # 1 default + 5 created


def test_board_isolation_between_users(client):
    """Users cannot see, modify, or delete each other's boards."""
    # Register alice
    client.post("/api/auth/register", json={
        "username": "alice2", "password": "password123",
    })
    alice_board = client.post("/api/boards", json={"name": "Alice Private"}).json()
    alice_board_id = alice_board["id"]
    client.post("/api/auth/logout")

    # Register bob
    client.post("/api/auth/register", json={
        "username": "bob2", "password": "password123",
    })

    # Bob cannot read Alice's board
    assert client.get(f"/api/boards/{alice_board_id}").status_code == 404

    # Bob cannot rename Alice's board
    assert client.patch(f"/api/boards/{alice_board_id}", json={"name": "Stolen"}).status_code == 404

    # Bob cannot delete Alice's board
    assert client.delete(f"/api/boards/{alice_board_id}").status_code == 404


def test_session_persists_across_requests(signed_in):
    """Session cookie works for multiple API calls."""
    assert signed_in.get("/api/auth/me").status_code == 200
    assert signed_in.get("/api/boards").status_code == 200
    assert signed_in.get("/api/auth/me").status_code == 200


def test_logout_invalidates_session(client):
    """After logout, session cookie is invalid."""
    client.post("/api/auth/login", json=CREDENTIALS)
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/boards").status_code == 401


def test_multiple_boards_with_different_content(signed_in):
    """Different boards maintain independent content."""
    boards = signed_in.get("/api/boards").json()
    board1_id = boards[0]["id"]

    # Create second board
    board2 = signed_in.post("/api/boards", json={"name": "Board 2"}).json()
    board2_id = board2["id"]

    # Modify board 1
    doc1 = signed_in.get(f"/api/boards/{board1_id}").json()
    doc1["board"]["columns"][0]["name"] = "Changed in board 1"
    signed_in.put(f"/api/boards/{board1_id}", json=doc1)

    # Board 2 should be unaffected
    doc2 = signed_in.get(f"/api/boards/{board2_id}").json()
    assert doc2["board"]["columns"][0]["name"] == "Ideas"

    # Board 1 should have the change
    doc1_refreshed = signed_in.get(f"/api/boards/{board1_id}").json()
    assert doc1_refreshed["board"]["columns"][0]["name"] == "Changed in board 1"


def test_card_with_all_enhanced_fields(signed_in):
    """Card with priority, labels, and due_date round-trips correctly."""
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]
    doc = signed_in.get(f"/api/boards/{board_id}").json()

    doc["board"]["columns"][0]["cards"].append({
        "id": "full-card",
        "title": "Full featured card",
        "details": "Has all metadata",
        "labels": ["feature", "v2", "frontend"],
        "due_date": "2026-12-25",
        "priority": "high",
    })
    response = signed_in.put(f"/api/boards/{board_id}", json=doc)
    assert response.status_code == 200
    card = response.json()["board"]["columns"][0]["cards"][-1]
    assert card["id"] == "full-card"
    assert card["title"] == "Full featured card"
    assert card["labels"] == ["feature", "v2", "frontend"]
    assert card["due_date"] == "2026-12-25"
    assert card["priority"] == "high"


def test_rename_board_preserves_content(signed_in):
    """Renaming a board does not affect its card content."""
    boards = signed_in.get("/api/boards").json()
    board_id = boards[0]["id"]

    # Read original content
    doc_before = signed_in.get(f"/api/boards/{board_id}").json()
    card_count = sum(len(col["cards"]) for col in doc_before["board"]["columns"])

    # Rename
    signed_in.patch(f"/api/boards/{board_id}", json={"name": "Renamed Board"})

    # Content should be unchanged
    doc_after = signed_in.get(f"/api/boards/{board_id}").json()
    after_count = sum(len(col["cards"]) for col in doc_after["board"]["columns"])
    assert after_count == card_count
    assert doc_after["revision"] == doc_before["revision"]
