from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.auth import Session, require_session
from app.models import BoardDocument, BoardListItem, CreateBoard, UpdateBoard

router = APIRouter(tags=["Board"])
AuthenticatedSession = Annotated[Session, Depends(require_session)]


# --- Multi-board CRUD ---

@router.get("/api/boards")
def list_boards(request: Request, session: AuthenticatedSession) -> list[BoardListItem]:
    return request.app.state.database.list_boards(session.user.id)


@router.post("/api/boards", status_code=201)
def create_board(body: CreateBoard, request: Request, session: AuthenticatedSession) -> dict:
    return request.app.state.database.create_board(session.user.id, body.name, body.description)


@router.get("/api/boards/{board_id}")
def read_board_by_id(board_id: int, request: Request, session: AuthenticatedSession) -> BoardDocument:
    return request.app.state.database.read_board(session.user.id, board_id)


@router.put("/api/boards/{board_id}")
def save_board_by_id(
    board_id: int, document: BoardDocument, request: Request, session: AuthenticatedSession
) -> BoardDocument:
    return request.app.state.database.save_board(session.user.id, document, board_id)


@router.patch("/api/boards/{board_id}")
def update_board_meta(
    board_id: int, body: UpdateBoard, request: Request, session: AuthenticatedSession
) -> dict:
    return request.app.state.database.update_board_meta(session.user.id, board_id, body.name, body.description)


@router.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: int, request: Request, session: AuthenticatedSession) -> None:
    try:
        request.app.state.database.delete_board(session.user.id, board_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Legacy single-board endpoints (backward compat) ---

@router.get("/api/board")
@router.get("/api/board/", include_in_schema=False)
def read_board_legacy(request: Request, session: AuthenticatedSession) -> BoardDocument:
    return request.app.state.database.read_board(session.user.id)


@router.put("/api/board")
@router.put("/api/board/", include_in_schema=False)
def save_board_legacy(
    document: BoardDocument, request: Request, session: AuthenticatedSession
) -> BoardDocument:
    return request.app.state.database.save_board(session.user.id, document)
