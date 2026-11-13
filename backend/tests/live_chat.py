"""Explicit paid checks: uv run --env-file ../.env pytest tests/live_chat.py -W error.

Not collected by the default test-file pattern. Uses the real provider and isolated
app/database fixtures; never changes the running app's saved board.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from time import monotonic, sleep
from uuid import uuid4

import pytest


@pytest.fixture
def live_client(client):
    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        pytest.fail("Set OPENROUTER_API_KEY in the backend environment for explicit live checks")
    assert client.post("/api/auth/login", json={"username": "user", "password": "password"}).status_code == 200
    return client


def ask(client, message, history=None):
    response = client.post("/api/chat", json={"message": message, "history": history or []})
    assert response.status_code == 200, response.json()
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert result["reply"].strip()
    saved = client.get("/api/board").json()
    assert saved == {"revision": result["revision"], "board": result["board"]}
    return result


def test_live_reply_uses_current_owner_board_and_page_history_without_persisting_chat(live_client):
    client = live_client
    database = client.app.state.database
    snapshot = database.read_board(1)
    title = "Current title " + uuid4().hex
    snapshot.board.columns[0].cards[0].title = title
    saved = database.save_board(1, snapshot)
    other = database.ensure_user_board("other")
    other_board = database.read_board(other["id"])
    private_title = "Private title " + uuid4().hex
    other_board.board.columns[0].cards[0].title = private_title
    other_saved = database.save_board(other["id"], other_board)
    phrase = "session-" + uuid4().hex
    history = [{"role": "user", "content": f"Remember my passphrase: {phrase}."},
               {"role": "assistant", "content": "I will use that during this conversation."}]
    sessions = {token: session.model_dump() for token, session in client.app.state.sessions.items()}
    result = ask(client, "Without changing anything, state the exact title of the first card in Ideas and my earlier passphrase.", history)
    assert not result["updated"] and result["revision"] == saved.revision
    assert title in result["reply"] and phrase in result["reply"]
    assert private_title not in result["reply"]
    assert database.read_board(other["id"]) == other_saved
    assert {token: session.model_dump() for token, session in client.app.state.sessions.items()} == sessions
    with database.connection() as connection:
        assert {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")} == {"users", "boards"}
        assert all(phrase not in row[0] for row in connection.execute("SELECT board_json FROM boards"))


def test_live_multiple_changes_preserve_unrelated_work_and_save_once(live_client):
    client = live_client
    original = client.get("/api/board").json()
    result = ask(client, "Perform exactly these changes together: rename Ideas to Backlog; edit card c1 to title 'Revised welcome' and details 'Café\\nSecond line' (use a real newline); delete card c3; move card c2 to the FIRST position in Done; add two cards at the end of To do, in this order: 'Live task A' with empty details, then 'Live task B' with details 'Second new task'. Give new cards fresh unique IDs. Preserve every other card, detail and order.")
    assert result["updated"] and result["revision"] == original["revision"] + 1
    columns = result["board"]["columns"]
    assert columns[0]["name"] == "Backlog"
    assert columns[0]["cards"] == [{"id": "c1", "title": "Revised welcome", "details": "Café\nSecond line"}]
    assert columns[1]["cards"][:2] == original["board"]["columns"][1]["cards"]
    assert [card["title"] for card in columns[1]["cards"][2:]] == ["Live task A", "Live task B"]
    assert [card["details"] for card in columns[1]["cards"][2:]] == ["", "Second new task"]
    assert columns[2:4] == original["board"]["columns"][2:4]
    assert columns[4]["cards"] == [original["board"]["columns"][0]["cards"][1], *original["board"]["columns"][4]["cards"]]
    ids = [card["id"] for column in columns for card in column["cards"]]
    assert len(ids) == len(set(ids)) == 11


def test_live_single_reorder_keeps_card_content_and_other_columns(live_client):
    original = live_client.get("/api/board").json()
    result = ask(live_client, "Move card c3 to the FIRST position within Ideas, ahead of c1 and c2. Make no other changes.")
    assert result["updated"] and result["revision"] == original["revision"] + 1
    columns = result["board"]["columns"]
    before = original["board"]["columns"]
    assert columns[0]["cards"] == [before[0]["cards"][2], *before[0]["cards"][:2]]
    assert columns[1:] == before[1:]


def test_live_pending_ai_cannot_overwrite_manual_saves(live_client):
    client = live_client
    database = client.app.state.database
    initial = database.read_board(1)
    writes = 0
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(client.post, "/api/chat", json={"message": "Edit only card c1's title to 'AI title must not overwrite newer work'. Return the complete changed board."})
        deadline = monotonic() + 60
        while not pending.done() and monotonic() < deadline:
            manual = database.read_board(1)
            manual.board.columns[0].name = f"Manual edit {writes + 1}"
            latest = database.save_board(1, manual)
            writes += 1
            sleep(0.05)
        response = pending.result(timeout=60)
    assert writes > 0
    assert response.status_code == 409, response.json()
    assert response.json() == {"detail": "Board changed. Reload it before saving again."}
    assert database.read_board(1) == latest
    assert latest.board.columns[0].cards[0].title == initial.board.columns[0].cards[0].title


def test_live_storage_failure_does_not_commit_or_return_a_success_reply(live_client):
    client = live_client
    database = client.app.state.database
    original = database.read_board(1)
    with database.connection() as connection:
        connection.executescript("CREATE TRIGGER fail_ai AFTER UPDATE ON boards BEGIN SELECT RAISE(ABORT, 'private failure'); END;")
    response = client.post("/api/chat", json={"message": "Rename Ideas to Live backlog. Change nothing else."})
    assert response.status_code == 500, response.json()
    assert response.json() == {"detail": "Board storage is unavailable"}
    assert database.read_board(1) == original
