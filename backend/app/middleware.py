from fastapi import Request
from fastapi.responses import JSONResponse


def _is_cross_site(request: Request) -> bool:
    if request.headers.get("sec-fetch-site") == "cross-site":
        return True
    origin = request.headers.get("origin")
    if origin:
        expected = f"{request.url.scheme}://{request.url.netloc}"
        if origin != expected:
            return True
    return False


async def protect_browser_requests(request: Request, call_next):
    if (request.url.path.startswith("/api/")
        and request.method not in {"GET", "HEAD", "OPTIONS"}
        and _is_cross_site(request)):
        response = JSONResponse({"detail": "Cross-site requests are not allowed"}, status_code=403)
    else:
        response = await call_next(request)
    if request.url.path.startswith("/api/auth/") or request.url.path.rstrip("/") in {"/api/board", "/api/chat"}:
        response.headers["Cache-Control"] = "no-store"
    return response
