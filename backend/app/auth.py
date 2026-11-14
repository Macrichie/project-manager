import os
import secrets
from time import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.database import Database

COOKIE_NAME = "forma_session"
SESSION_SECONDS = 8 * 60 * 60
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 5
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class Credentials(BaseModel):
    username: str
    password: str


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


@router.post("/login")
def login(credentials: Credentials, request: Request, response: Response) -> SessionInfo:
    _check_rate_limit(request)
    expected_username = os.environ.get("FORMA_USERNAME", "user")
    expected_password = os.environ.get("FORMA_PASSWORD", "password")
    username_ok = secrets.compare_digest(credentials.username, expected_username)
    password_ok = secrets.compare_digest(credentials.password, expected_password)
    if not (username_ok and password_ok):
        _record_failed_attempt(request)
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    database = _database(request)
    user = database.get_user(expected_username)
    if user is None:
        raise HTTPException(status_code=500, detail="Sign-in data is unavailable")
    old_token = request.cookies.get(COOKIE_NAME, "")
    if old_token:
        database.delete_session(old_token)
    token = secrets.token_urlsafe(32)
    expires_at = time() + SESSION_SECONDS
    database.create_session(token, user["id"], expires_at)
    session = Session(user=User.model_validate(user), expires_at=expires_at)
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_SECONDS, path="/api",
        httponly=True, samesite="strict", secure=request.url.scheme == "https",
    )
    return session_info(session)


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
