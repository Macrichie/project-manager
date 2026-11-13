from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.auth import Session, require_session
from app.models import BoardDocument

router = APIRouter(prefix="/api/board", tags=["Board"])
AuthenticatedSession = Annotated[Session, Depends(require_session)]


@router.get("")
@router.get("/", include_in_schema=False)
def read_board(request: Request, session: AuthenticatedSession) -> BoardDocument:
    return request.app.state.database.read_board(session.user.id)


@router.put("")
@router.put("/", include_in_schema=False)
def save_board(
    document: BoardDocument, request: Request, session: AuthenticatedSession
) -> BoardDocument:
    return request.app.state.database.save_board(session.user.id, document)
