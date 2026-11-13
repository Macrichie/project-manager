import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
from pathlib import Path
from threading import Barrier
from time import monotonic

import pytest
from fastapi.testclient import TestClient

from app.auth import COOKIE_NAME, SESSION_SECONDS, Session, User
from app.database import SCHEMA, SEED_PATH, BoardConflict, Database
from app.main import create_app
from app.models import BoardDocument

CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def signed_in(client):
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 200
    return client


def test_fresh_database_has_the_exact_approved_seed(signed_in):
    response = signed_in.get("/api/board")
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    example = Path(__file__).resolve().parents[2] / "docs" / "board.example.json"
    assert seed == json.loads(example.read_text(encoding="utf-8"))
    assert response.status_code == 200
    assert response.json() == {"revision": 1, "board": seed}
    assert response.headers["cache-control"] == "no-store"
    assert signed_in.get("/api/board/").json() == response.json()
    with signed_in.app.state.database.connection() as connection:
        tables = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        assert {row["name"] for row in tables} == {"users", "boards"}
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_all_board_operations_round_trip_and_survive_reinitialization(signed_in):
    original = signed_in.get("/api/board").json()
    updated = deepcopy(original)
    columns = updated["board"]["columns"]
    columns[0]["name"] = "  À faire  "
    columns[0]["cards"].reverse()
    moved = columns[0]["cards"].pop(1)
    columns[1]["cards"].insert(1, moved)
    columns[2]["cards"].pop(0)
    columns[3]["cards"][0].update(title="  Long title " + "word " * 300, details="Café\n第二行\n  ")
    columns[4]["cards"].insert(0, {"id": "new-card", "title": "A new card", "details": ""})
    response = signed_in.put("/api/board", json=updated)
    expected = {**updated, "revision": 2}
    assert response.status_code == 200
    assert response.json() == expected
    assert signed_in.get("/api/board").json() == expected
    signed_in.post("/api/auth/logout")
    signed_in.post("/api/auth/login", json=CREDENTIALS)
    assert signed_in.get("/api/board").json() == expected
    reopened = Database(signed_in.app.state.database.path)
    reopened.initialize()
    assert reopened.read_board(1).model_dump() == expected
    assert signed_in.put("/api/board/", json=expected).json() == {**expected, "revision": 3}


def test_empty_board_survives_app_restart_without_reseeding(signed_in):
    document = signed_in.get("/api/board").json()
    for column in document["board"]["columns"]:
        column["cards"] = []
    saved = signed_in.put("/api/board", json=document).json()
    old_token = signed_in.cookies.get(COOKIE_NAME)
    database_path = signed_in.app.state.database.path
    with TestClient(create_app(database_path.parent.parent / "static", database_path=database_path)) as restarted:
        assert restarted.get("/api/board", headers={"cookie": f"{COOKIE_NAME}={old_token}"}).status_code == 401
        restarted.post("/api/auth/login", json=CREDENTIALS)
        assert restarted.get("/api/board").json() == saved


@pytest.mark.parametrize("method", ["GET", "PUT"])
def test_board_requires_a_valid_session(client, method):
    for headers in [{}, {"cookie": f"{COOKIE_NAME}=forged"}]:
        response = client.request(method, "/api/board", headers=headers, json={})
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(("path", "value"), [
    (("revision",), 0),
    (("revision",), "1"),
    (("revision",), True),
    (("user_id",), 2),
    (("board", "chat"), []),
    (("board", "columns", 0, "name"), " \n\t"),
    (("board", "columns", 0, "id"), "different"),
    (("board", "columns", 0, "cards", 0, "id"), ""),
    (("board", "columns", 0, "cards", 0, "title"), "\n "),
    (("board", "columns", 0, "cards", 0, "details"), 42),
    (("board", "columns", 0, "cards", 0, "owner"), 2),
])
def test_invalid_fields_cannot_change_saved_data(signed_in, path, value):
    original = signed_in.get("/api/board").json()
    invalid = deepcopy(original)
    target = invalid
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    response = signed_in.put("/api/board", json=invalid)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"
    assert signed_in.get("/api/board").json() == original


@pytest.mark.parametrize("change", ["duplicate_card", "missing_column", "extra_column", "reordered_columns"])
def test_invalid_board_structure_cannot_change_saved_data(signed_in, change):
    original = signed_in.get("/api/board").json()
    invalid = deepcopy(original)
    columns = invalid["board"]["columns"]
    if change == "duplicate_card":
        columns[1]["cards"].append(deepcopy(columns[0]["cards"][0]))
    elif change == "missing_column":
        columns.pop()
    elif change == "extra_column":
        columns.append({"id": "extra", "name": "Extra", "cards": []})
    else:
        columns.reverse()
    assert signed_in.put("/api/board", json=invalid).status_code == 422
    assert signed_in.get("/api/board").json() == original


def test_user_can_only_read_and_write_their_own_board(signed_in):
    database = signed_in.app.state.database
    other = database.ensure_user_board("other")
    signed_in.app.state.sessions["other-token"] = Session(
        user=User.model_validate(other), expires_at=monotonic() + SESSION_SECONDS
    )
    other_headers = {"cookie": f"{COOKIE_NAME}=other-token"}
    original = signed_in.get("/api/board").json()
    candidate = signed_in.get("/api/board", headers=other_headers).json()
    candidate["board"]["columns"][0]["cards"][0]["title"] = "Other user's private title"
    saved = signed_in.put("/api/board", json=candidate, headers=other_headers)
    assert saved.status_code == 200
    assert signed_in.get("/api/board", headers=other_headers).json() == saved.json()
    assert signed_in.get("/api/board").json() == original
    assert database.read_board(other["id"]).model_dump() == saved.json()
    assert signed_in.get(f"/api/board/{other['id']}").status_code == 404


def test_stale_and_cross_site_writes_preserve_the_latest_board(signed_in):
    stale = signed_in.get("/api/board").json()
    latest = deepcopy(stale)
    latest["board"]["columns"][0]["name"] = "Saved first"
    saved = signed_in.put("/api/board", json=latest).json()
    response = signed_in.put("/api/board", json=stale)
    assert response.status_code == 409
    assert response.json() == {"detail": "Board changed. Reload it before saving again."}
    assert response.headers["cache-control"] == "no-store"
    blocked = signed_in.put("/api/board", json=saved, headers={"sec-fetch-site": "cross-site"})
    assert blocked.status_code == 403
    assert blocked.headers["cache-control"] == "no-store"
    assert signed_in.get("/api/board").json() == saved


def test_concurrent_writers_cannot_overwrite_each_other(signed_in):
    database = signed_in.app.state.database
    original = database.read_board(1).model_dump()
    barrier = Barrier(2)

    def write(name):
        candidate = deepcopy(original)
        candidate["board"]["columns"][0]["name"] = name
        document = BoardDocument.model_validate(candidate)
        barrier.wait(timeout=5)
        try:
            return database.save_board(1, document)
        except BoardConflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(write, ["First", "Second"]))
    winners = [result for result in results if result is not None]
    assert len(winners) == 1
    assert winners[0].revision == 2
    assert database.read_board(1) == winners[0]


def test_missing_board_is_not_recreated_by_read_or_write(signed_in):
    document = signed_in.get("/api/board").json()
    database = signed_in.app.state.database
    with database.connection() as connection:
        connection.execute("DELETE FROM boards WHERE user_id = 1")
    for method in ["GET", "PUT"]:
        response = signed_in.request(method, "/api/board", json=document)
        assert response.status_code == 404
        assert response.headers["cache-control"] == "no-store"
    with database.connection() as connection:
        assert connection.execute("SELECT count(*) FROM boards").fetchone()[0] == 0


def test_failed_write_rolls_back_and_returns_a_safe_error(signed_in):
    original = signed_in.get("/api/board").json()
    with signed_in.app.state.database.connection() as connection:
        connection.executescript("""
            CREATE TRIGGER fail_write AFTER UPDATE ON boards BEGIN
                SELECT RAISE(ABORT, 'private storage error');
            END;
        """)
    candidate = deepcopy(original)
    candidate["board"]["columns"][0]["name"] = "Must not save"
    response = signed_in.put("/api/board", json=candidate)
    assert response.status_code == 500
    assert response.json() == {"detail": "Board storage is unavailable"}
    assert response.headers["cache-control"] == "no-store"
    assert signed_in.get("/api/board").json() == original


def test_invalid_stored_data_is_reported_and_never_reseeded(signed_in):
    database = signed_in.app.state.database
    with database.connection() as connection:
        connection.execute("UPDATE boards SET board_json = '{}' WHERE user_id = 1")
    database.initialize()
    response = signed_in.get("/api/board")
    assert response.status_code == 500
    assert response.json() == {"detail": "Board storage is unavailable"}
    with database.connection() as connection:
        assert connection.execute("SELECT board_json FROM boards WHERE user_id = 1").fetchone()[0] == "{}"


def test_login_resolves_the_stored_user_id_instead_of_assuming_one(tmp_path):
    database_path = tmp_path / "existing.db"
    with closing(sqlite3.connect(database_path)) as connection:
        with connection:
            connection.executescript(SCHEMA)
            connection.execute("INSERT INTO users (id, username) VALUES (42, 'user')")
    with TestClient(create_app(tmp_path, database_path=database_path)) as client:
        response = client.post("/api/auth/login", json=CREDENTIALS)
        assert response.json()["user"] == {"id": 42, "username": "user"}
        assert client.get("/api/board").status_code == 200
        with client.app.state.database.connection() as connection:
            assert connection.execute("SELECT user_id FROM boards").fetchone()[0] == 42
