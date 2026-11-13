from secrets import token_urlsafe
from time import monotonic
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

COOKIE_NAME = "forma_session"
SESSION_SECONDS = 8 * 60 * 60
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


def require_session(request: Request) -> Session:
    token = request.cookies.get(COOKIE_NAME, "")
    sessions: dict[str, Session] = request.app.state.sessions
    session = sessions.get(token)
    if session is None or session.expires_at <= monotonic():
        sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return session


def session_info(session: Session) -> SessionInfo:
    return SessionInfo(user=session.user, expires_in=session.expires_at - monotonic())


@router.post("/login")
def login(credentials: Credentials, request: Request, response: Response) -> SessionInfo:
    if credentials.username != "user" or credentials.password != "password":
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    sessions: dict[str, Session] = request.app.state.sessions
    sessions.pop(request.cookies.get(COOKIE_NAME, ""), None)
    token = token_urlsafe(32)
    session = Session(user=User(id=1, username="user"), expires_at=monotonic() + SESSION_SECONDS)
    sessions[token] = session
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
    request.app.state.sessions.pop(request.cookies.get(COOKIE_NAME, ""), None)
    response.delete_cookie(
        COOKIE_NAME, path="/api", httponly=True, samesite="strict",
        secure=request.url.scheme == "https",
    )
