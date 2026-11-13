import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router

FRONTEND_DIST = Path(
    os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "out")
)


def create_app(frontend_dir: Path = FRONTEND_DIST) -> FastAPI:
    app = FastAPI(title="Forma API")
    app.state.sessions = {}
    app.include_router(auth_router)

    @app.middleware("http")
    async def protect_browser_requests(request: Request, call_next):
        if (request.url.path.startswith("/api/")
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.headers.get("sec-fetch-site") == "cross-site"):
            return JSONResponse({"detail": "Cross-site requests are not allowed"}, status_code=403)
        response = await call_next(request)
        if request.url.path.startswith("/api/auth/"):
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
    def unknown_api() -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    app.mount("/", StaticFiles(directory=frontend_dir, html=True, check_dir=False), name="frontend")
    return app


app = create_app()
