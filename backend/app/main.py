import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match

from app.auth import router as auth_router
from app.boards import router as board_router
from app.chat import router as chat_router
from app.database import (
    DEFAULT_DATABASE_PATH, BoardConflict, BoardNotFound, Database, StoredBoardError,
)

FRONTEND_DIST = Path(
    os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "out")
)


def create_app(frontend_dir: Path = FRONTEND_DIST, database_path: Path | None = None) -> FastAPI:
    database = Database(database_path if database_path is not None else Path(
        os.environ.get("DATABASE_PATH", DEFAULT_DATABASE_PATH)
    ))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.initialize()
        yield

    app = FastAPI(title="Forma API", lifespan=lifespan)
    app.state.database = database
    app.state.sessions = {}
    api_routers = (auth_router, board_router, chat_router)
    for router in api_routers:
        app.include_router(router)

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

    @app.middleware("http")
    async def protect_browser_requests(request: Request, call_next):
        if (request.url.path.startswith("/api/")
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.headers.get("sec-fetch-site") == "cross-site"):
            response = JSONResponse({"detail": "Cross-site requests are not allowed"}, status_code=403)
        else:
            response = await call_next(request)
        if request.url.path.startswith("/api/auth/") or request.url.path.rstrip("/") in {"/api/board", "/api/chat"}:
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    @app.get("/api/health/", include_in_schema=False)
    @app.get("/health", include_in_schema=False)
    @app.get("/health/", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/hello")
    @app.get("/api/hello/", include_in_schema=False)
    @app.get("/hello", include_in_schema=False)
    @app.get("/hello/", include_in_schema=False)
    def hello() -> dict[str, str]:
        return {"message": "Hello, world!"}

    api_methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

    @app.api_route("/api", methods=api_methods, include_in_schema=False)
    @app.api_route("/api/{path:path}", methods=api_methods, include_in_schema=False)
    def unknown_api(request: Request) -> None:
        allowed = set()
        for router in (app.router, *api_routers):
            for route in router.routes:
                if isinstance(route, APIRoute) and route.matches(request.scope)[0] == Match.PARTIAL:
                    allowed.update(route.methods)
        if allowed:
            raise HTTPException(
                status_code=405, detail="Method Not Allowed",
                headers={"Allow": ", ".join(sorted(allowed))},
            )
        raise HTTPException(status_code=404, detail="Not Found")

    app.mount("/", StaticFiles(directory=frontend_dir, html=True, check_dir=False), name="frontend")
    return app


app = create_app()
