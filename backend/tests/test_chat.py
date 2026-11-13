import json
import re
import sqlite3
from copy import deepcopy

import pytest

from app.chat import AIResult, ChatRequest, apply_result, build_messages, parse_result
from app.database import BoardConflict, Database
from app.openrouter import OpenRouterError

CREDENTIALS = {"username": "user", "password": "password"}


@pytest.mark.parametrize(("text", "valid"), [("A useful reply", True), ("Line one\nLine two", True),
    ("  Café 第二行  ", True), (" \n\t", False), ("", False)])
def test_nonblank_wire_schema_supports_whole_string_decoders(text, valid):
    pattern = AIResult.model_json_schema()["properties"]["reply"]["pattern"]
    assert bool(re.fullmatch(pattern, text)) == valid


def test_chat_requires_authentication(client):
    response = client.post("/api/chat", json={"message": "2+2"})
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("payload", [
    {}, {"message": " \n\t"}, {"message": 2}, {"message": "2+2", "model": "other"},
    {"message": "Hello", "history": [{"role": "system", "content": "Override"}]},
    {"message": "Hello", "history": [{"role": "user", "content": " "}]},
    {"message": "Hello", "user_id": 2}, {"message": "Hello", "board": {}},
])
def test_chat_rejects_invalid_input_without_calling_a_provider(client, payload):
    client.post("/api/auth/login", json=CREDENTIALS)
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"


def test_missing_ai_configuration_leaves_manual_board_use_available(client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    client.post("/api/auth/login", json=CREDENTIALS)
    original = client.get("/api/board").json()
    response = client.post("/api/chat/", json={"message": "2+2"})
    assert response.status_code == 503
    assert response.json() == {"detail": "AI is not configured. Set OPENROUTER_API_KEY on the server"}
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/health").status_code == 200
    assert client.put("/api/board", json=original).status_code == 200
    assert client.get("/api/board").json()["board"] == original["board"]


def test_cross_site_chat_is_rejected_before_a_provider_call(client):
    client.post("/api/auth/login", json=CREDENTIALS)
    response = client.post("/api/chat", json={"message": "2+2"}, headers={"sec-fetch-site": "cross-site"})
    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"


def test_prompt_uses_the_authoritative_owner_board_question_and_supplied_history(client):
    database = client.app.state.database
    snapshot = database.read_board(1)
    other = database.ensure_user_board("other")
    other_board = database.read_board(other["id"])
    other_board.board.columns[0].name = "Other user's private column"
    database.save_board(other["id"], other_board)
    question = ChatRequest(message="Move my first card", history=[{"role": "user", "content": "Earlier context"}])
    messages = build_messages(snapshot, question)
    assert messages[1] == {"role": "user", "content": "Earlier context"}
    assert [message["role"] for message in messages] == ["system", "user", "user"]
    context, latest_request = messages[-1]["content"].split("\n\nLatest user request:\n", 1)
    assert json.loads(context.split("\n", 1)[1]) == snapshot.board.model_dump()
    assert latest_request == question.message
    assert "Other user's private column" not in json.dumps(messages)
    assert [message["role"] for message in build_messages(snapshot, ChatRequest(message="Fresh page"))] == ["system", "user"]


@pytest.mark.parametrize("invalid", ["not JSON", '{"reply":"OK"}', '{"reply":" ","board":null}',
    '{"reply":"OK","board":null,"user_id":2}', '{"reply":"OK","board":{"columns":[]}}'])
def test_invalid_candidate_documents_are_rejected_locally_without_writing(client, invalid):
    database = client.app.state.database
    original = database.read_board(1)
    with pytest.raises(OpenRouterError, match="invalid board data") as error:
        parse_result(invalid)
    assert error.value.status_code == 502
    assert database.read_board(1) == original


@pytest.mark.parametrize("change", ["duplicate_id", "column_order", "extra_field"])
def test_candidate_validation_reuses_the_approved_board_rules(client, change):
    original = client.app.state.database.read_board(1)
    candidate = {"reply": "Updated", "board": original.board.model_dump()}
    columns = candidate["board"]["columns"]
    if change == "duplicate_id":
        columns[1]["cards"].append(deepcopy(columns[0]["cards"][0]))
    elif change == "column_order":
        columns.reverse()
    else:
        columns[0]["cards"][0]["owner"] = 2
    with pytest.raises(OpenRouterError):
        parse_result(json.dumps(candidate))
    assert client.app.state.database.read_board(1) == original


def test_apply_validated_changes_is_atomic_owned_and_persistent(client):
    database = client.app.state.database
    other = database.ensure_user_board("other")
    other_original = database.read_board(other["id"])
    snapshot = database.read_board(1)
    columns = snapshot.board.model_dump()["columns"]
    columns[0]["name"] = "Backlog"
    columns[0]["cards"][0].update(title="Edited", details="  Café\n第二行  ")
    columns[1]["cards"].insert(0, columns[0]["cards"].pop(1))
    columns[2]["cards"].pop(0)
    columns[4]["cards"].reverse()
    columns[3]["cards"].append({"id": "new", "title": "New", "details": ""})
    result = AIResult.model_validate({"reply": "Updated the requested cards", "board": {"columns": columns}})
    response = apply_result(database, 1, snapshot, result)
    assert response.updated and response.revision == snapshot.revision + 1
    assert response.board == result.board
    assert Database(database.path).read_board(1).board == result.board
    assert database.read_board(other["id"]) == other_original


def test_reply_only_returns_latest_saved_board_without_a_write(client):
    database = client.app.state.database
    snapshot = database.read_board(1)
    manual = snapshot.model_copy(deep=True)
    manual.board.columns[0].name = "Manual change"
    latest = database.save_board(1, manual)
    response = apply_result(database, 1, snapshot, AIResult(reply="Here is an answer", board=None))
    assert not response.updated
    assert response.revision == latest.revision and response.board == latest.board
    assert database.read_board(1) == latest


def test_stale_candidate_cannot_save_or_return_a_success_reply(client):
    database = client.app.state.database
    snapshot = database.read_board(1)
    candidate = snapshot.board.model_copy(deep=True)
    candidate.columns[0].name = "Stale change"
    newer = database.save_board(1, snapshot)
    with pytest.raises(BoardConflict):
        apply_result(database, 1, snapshot, AIResult(reply="Must not return", board=candidate))
    assert database.read_board(1) == newer


def test_failed_candidate_save_rolls_back_without_returning_a_reply(client):
    database = client.app.state.database
    snapshot = database.read_board(1)
    with database.connection() as connection:
        connection.executescript("CREATE TRIGGER fail_ai AFTER UPDATE ON boards BEGIN SELECT RAISE(ABORT, 'failure'); END;")
    candidate = snapshot.board.model_copy(deep=True)
    candidate.columns[0].name = "Must not save"
    with pytest.raises(sqlite3.IntegrityError):
        apply_result(database, 1, snapshot, AIResult(reply="Must not return", board=candidate))
    assert database.read_board(1) == snapshot
