import sqlite3

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import BoardConflict, BoardNotFound, StoredBoardError


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(BoardNotFound)
    async def missing_board(request: Request, error: BoardNotFound):
        return JSONResponse({"detail": "Board not found"}, status_code=404)

    @app.exception_handler(BoardConflict)
    async def stale_board(request: Request, error: BoardConflict):
        return JSONResponse(
            {"detail": "Board changed. Reload it before saving again."}, status_code=409
        )

    @app.exception_handler(sqlite3.Error)
    @app.exception_handler(StoredBoardError)
    async def storage_error(request: Request, error: Exception):
        return JSONResponse({"detail": "Board storage is unavailable"}, status_code=500)
