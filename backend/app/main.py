import os
from contextlib import asynccontextmanager
from pathlib import Path
from time import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match

from app.auth import router as auth_router
from app.boards import router as board_router
from app.chat import router as chat_router
from app.database import DEFAULT_DATABASE_PATH, Database
from app.errors import register_exception_handlers
from app.health import router as health_router
from app.middleware import protect_browser_requests

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
        database.cleanup_sessions(time())
        yield

    app = FastAPI(title="Forma API", lifespan=lifespan)
    app.state.database = database
    app.state.login_attempts = {}

    api_routers = (auth_router, board_router, chat_router, health_router)
    for router in api_routers:
        app.include_router(router)

    register_exception_handlers(app)
    app.middleware("http")(protect_browser_requests)

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
