FROM node:26-slim AS frontend-build

WORKDIR /frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /uvx /bin/

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    FRONTEND_DIST=/app/static \
    PATH="/app/.venv/bin:$PATH"

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project && rm /bin/uv /bin/uvx
COPY backend/app ./app
COPY --from=frontend-build /frontend/out ./static

RUN adduser --disabled-password --no-create-home appuser \
    && mkdir -p /data && chown appuser /data
VOLUME /data
EXPOSE 8000
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
