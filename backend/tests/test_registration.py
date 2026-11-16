from app.auth import COOKIE_NAME

CREDENTIALS = {"username": "user", "password": "password"}


def test_register_creates_user_and_session(client):
    response = client.post("/api/auth/register", json={
        "username": "newuser", "password": "Secret123!", "display_name": "New User"
    })
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "newuser"
    assert COOKIE_NAME in response.cookies


def test_register_duplicate_username_returns_409(client):
    client.post("/api/auth/register", json={"username": "dup", "password": "Secret123!"})
    response = client.post("/api/auth/register", json={"username": "dup", "password": "Other456!x"})
    assert response.status_code == 409


def test_register_blank_username_returns_422(client):
    response = client.post("/api/auth/register", json={"username": "  ", "password": "Secret123!"})
    assert response.status_code == 422


def test_register_short_password_returns_422(client):
    response = client.post("/api/auth/register", json={"username": "user2", "password": "ab"})
    assert response.status_code == 422


def test_password_stored_as_hash_not_plaintext(client):
    client.post("/api/auth/register", json={"username": "hashcheck", "password": "MyPassword1"})
    with client.app.state.database.connection() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = 'hashcheck'"
        ).fetchone()
    assert row["password_hash"] != "MyPassword1"
    assert row["password_hash"].startswith("pbkdf2:")


def test_login_works_with_registered_credentials(client):
    client.post("/api/auth/register", json={"username": "logintest", "password": "TestPass1!"})
    response = client.post("/api/auth/login", json={"username": "logintest", "password": "TestPass1!"})
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "logintest"


def test_login_rejects_wrong_password_for_registered_user(client):
    client.post("/api/auth/register", json={"username": "wrongpw", "password": "Correct1!"})
    response = client.post("/api/auth/login", json={"username": "wrongpw", "password": "Wrong1!!!"})
    assert response.status_code == 401


def test_registered_user_gets_default_board(client):
    response = client.post("/api/auth/register", json={
        "username": "boarduser", "password": "Secret123!"
    })
    assert response.status_code == 200
    # After registration, user should be able to read their board
    board_response = client.get("/api/board")
    assert board_response.status_code == 200
    assert board_response.json()["revision"] == 1


def test_env_var_login_still_works(client):
    """The existing env-var based login (default user/password) must continue to work."""
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "user"
