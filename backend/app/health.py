from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/api/health")
@router.get("/api/health/", include_in_schema=False)
@router.get("/health", include_in_schema=False)
@router.get("/health/", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/hello")
@router.get("/api/hello/", include_in_schema=False)
@router.get("/hello", include_in_schema=False)
@router.get("/hello/", include_in_schema=False)
def hello() -> dict[str, str]:
    return {"message": "Hello, world!"}
