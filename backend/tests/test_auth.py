import pytest

from app import auth

CREDENTIALS = {"username": "user", "password": "password"}


def test_login_sets_a_private_cookie_and_restores_current_user(client):
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 200
    assert response.json()["user"] == {"id": 1, "username": "user"}
    assert 0 < response.json()["expires_in"] <= auth.SESSION_SECONDS
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api" in cookie
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/auth/me").json()["user"] == {"id": 1, "username": "user"}


@pytest.mark.parametrize("credentials", [
    {"username": "user", "password": "wrong"},
    {"username": "someone", "password": "password"},
])
def test_incorrect_credentials_do_not_create_a_session(client, credentials):
    assert client.post("/api/auth/login", json=credentials).status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_missing_or_forged_cookie_cannot_access_current_user(client):
    assert client.get("/api/auth/me").status_code == 401
    response = client.get("/api/auth/me", headers={"cookie": "forma_session=forged"})
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


def test_login_rotates_the_session_and_rejects_the_old_token(client):
    client.post("/api/auth/login", json=CREDENTIALS)
    old_token = client.cookies.get(auth.COOKIE_NAME)
    client.post("/api/auth/login", json=CREDENTIALS)
    assert client.cookies.get(auth.COOKIE_NAME) != old_token
    assert client.get("/api/auth/me", headers={"cookie": f"forma_session={old_token}"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 200


def test_logout_revokes_the_cookie_and_is_idempotent(client):
    client.post("/api/auth/login", json=CREDENTIALS)
    old_token = client.cookies.get(auth.COOKIE_NAME)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.cookies.get(auth.COOKIE_NAME) is None
    assert client.get("/api/auth/me", headers={"cookie": f"forma_session={old_token}"}).status_code == 401
    assert client.post("/api/auth/logout").status_code == 204


def test_expired_session_is_rejected(client, monkeypatch):
    client.post("/api/auth/login", json=CREDENTIALS)
    future = auth.time() + auth.SESSION_SECONDS + 1
    monkeypatch.setattr(auth, "time", lambda: future)
    assert client.get("/api/auth/me").status_code == 401


def test_cross_site_writes_are_rejected_without_logging_out_the_user(client):
    client.post("/api/auth/login", json=CREDENTIALS)
    for path in ["/api/auth/login", "/api/auth/logout"]:
        assert client.post(path, json=CREDENTIALS, headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_cross_origin_writes_are_rejected(client):
    client.post("/api/auth/login", json=CREDENTIALS)
    response = client.post(
        "/api/auth/login", json=CREDENTIALS,
        headers={"origin": "https://evil.example.com"},
    )
    assert response.status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_login_requires_json_credentials(client):
    assert client.post("/api/auth/login", data=CREDENTIALS).status_code == 422
    assert client.get("/api/auth/me").status_code == 401


def test_env_var_credentials_override_defaults(client, monkeypatch):
    monkeypatch.setenv("FORMA_USERNAME", "admin")
    monkeypatch.setenv("FORMA_PASSWORD", "secret")
    client.app.state.database.ensure_user_board("admin")
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 401
    response = client.post("/api/auth/login", json={"username": "admin", "password": "secret"})
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "admin"


def test_rate_limiting_blocks_excessive_login_attempts(client):
    for _ in range(auth.RATE_LIMIT_MAX):
        client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 429
    assert "Too many" in response.json()["detail"]


def test_sessions_survive_app_restart(tmp_path):
    frontend_dir = tmp_path / "static"
    frontend_dir.mkdir()
    (frontend_dir / "index.html").write_text("<!doctype html>", encoding="utf-8")
    db_path = tmp_path / "data" / "kanban.db"
    from app.main import create_app
    from fastapi.testclient import TestClient
    with TestClient(create_app(frontend_dir, database_path=db_path)) as client:
        client.post("/api/auth/login", json=CREDENTIALS)
        token = client.cookies.get(auth.COOKIE_NAME)
    with TestClient(create_app(frontend_dir, database_path=db_path)) as restarted:
        response = restarted.get("/api/auth/me", headers={"cookie": f"{auth.COOKIE_NAME}={token}"})
        assert response.status_code == 200
        assert response.json()["user"]["username"] == "user"
