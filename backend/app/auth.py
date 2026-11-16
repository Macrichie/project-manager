import hashlib
import hmac
import os
import secrets
import sqlite3
from time import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.database import Database
from app.models import NonBlank

COOKIE_NAME = "forma_session"
SESSION_SECONDS = 8 * 60 * 60
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 5
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2:{salt.hex()}:{digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash or not password_hash.startswith("pbkdf2:"):
        return False
    parts = password_hash.split(":")
    if len(parts) != 3:
        return False
    salt = bytes.fromhex(parts[1])
    stored_digest = bytes.fromhex(parts[2])
    computed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return hmac.compare_digest(computed, stored_digest)


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Annotated[NonBlank, Field(max_length=50)]
    password: Annotated[str, Field(min_length=8, max_length=200)]
    display_name: str = ""


class User(BaseModel):
    id: int
    username: str


class Session(BaseModel):
    user: User
    expires_at: float


class SessionInfo(BaseModel):
    user: User
    expires_in: float


def _database(request: Request) -> Database:
    return request.app.state.database


def require_session(request: Request) -> Session:
    token = request.cookies.get(COOKIE_NAME, "")
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    database = _database(request)
    row = database.get_session(token)
    if row is None or row["expires_at"] <= time():
        if row is not None:
            database.delete_session(token)
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return Session(user=User(id=row["id"], username=row["username"]), expires_at=row["expires_at"])


def session_info(session: Session) -> SessionInfo:
    return SessionInfo(user=session.user, expires_in=max(0.0, session.expires_at - time()))


def _check_rate_limit(request: Request) -> None:
    login_attempts: dict[str, list[float]] = request.app.state.login_attempts
    client_ip = request.client.host if request.client else "unknown"
    now = time()
    attempts = login_attempts.get(client_ip, [])
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    login_attempts[client_ip] = attempts
    if len(attempts) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait before trying again.")


def _record_failed_attempt(request: Request) -> None:
    login_attempts: dict[str, list[float]] = request.app.state.login_attempts
    client_ip = request.client.host if request.client else "unknown"
    now = time()
    attempts = login_attempts.get(client_ip, [])
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    attempts.append(now)
    login_attempts[client_ip] = attempts


def _create_session_response(database: Database, user: dict, request: Request, response: Response) -> SessionInfo:
    old_token = request.cookies.get(COOKIE_NAME, "")
    if old_token:
        database.delete_session(old_token)
    token = secrets.token_urlsafe(32)
    expires_at = time() + SESSION_SECONDS
    database.create_session(token, user["id"], expires_at)
    session = Session(user=User(id=user["id"], username=user["username"]), expires_at=expires_at)
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_SECONDS, path="/api",
        httponly=True, samesite="strict", secure=request.url.scheme == "https",
    )
    return session_info(session)


@router.post("/register")
def register(registration: Registration, request: Request, response: Response) -> SessionInfo:
    database = _database(request)
    pw_hash = hash_password(registration.password)
    try:
        user = database.register_user(registration.username, pw_hash, registration.display_name)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username already taken")
    database.ensure_user_board(registration.username)
    return _create_session_response(database, user, request, response)


@router.post("/login")
def login(credentials: Credentials, request: Request, response: Response) -> SessionInfo:
    _check_rate_limit(request)
    database = _database(request)

    # First try env-var credentials (backward compatibility)
    expected_username = os.environ.get("FORMA_USERNAME", "user")
    expected_password = os.environ.get("FORMA_PASSWORD", "password")
    username_ok = secrets.compare_digest(credentials.username, expected_username)
    password_ok = secrets.compare_digest(credentials.password, expected_password)
    if username_ok and password_ok:
        user = database.get_user(expected_username)
        if user is None:
            raise HTTPException(status_code=500, detail="Sign-in data is unavailable")
        return _create_session_response(database, user, request, response)

    # Then try registered user credentials
    user = database.get_user(credentials.username)
    if user is not None and verify_password(credentials.password, user.get("password_hash", "")):
        return _create_session_response(database, user, request, response)

    _record_failed_attempt(request)
    raise HTTPException(status_code=401, detail="Incorrect username or password")


@router.get("/me")
def current_user(session: Annotated[Session, Depends(require_session)]) -> SessionInfo:
    return session_info(session)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME, "")
    if token:
        _database(request).delete_session(token)
    response.delete_cookie(
        COOKIE_NAME, path="/api", httponly=True, samesite="strict",
        secure=request.url.scheme == "https",
    )
