# Backend

- `app/main.py` initializes SQLite through the FastAPI lifespan, installs API routers and browser-write checks, then serves the static frontend. Keep API routes ahead of the static mount and retain JSON errors for unknown `/api` routes.
- `app/auth.py` accepts the MVP credentials and resolves the user ID from SQLite. Opaque HttpOnly/SameSite=Strict sessions stay in `app.state.sessions`, expire after eight hours, and are revoked on logout or server restart.
- `app/database.py` implements the approved design in `../docs/DATABASE.md`: two SQLite tables, one JSON board per user, seed-once initialization, short-lived connections, and atomic revision checks. Use `DATABASE_PATH` or the default `backend/data/kanban.db`. Never reseed an existing row, even if empty or invalid. Package the exact approved dummy board in `app/seed.json`.
- `app/models.py` owns strict board validation. `app/boards.py` exposes authenticated GET/PUT `/api/board`. Reuse this validation/storage path for future AI changes; stale revisions must return 409 without saving.
- Protect private routes with `Annotated[Session, Depends(require_session)]` and derive ownership from `session.user.id`. Never accept a client-supplied identity as authorization. Keep private responses uncached.
- Database design was approved for Part 6. Frontend persistence and AI work remain in later plan phases. Chat must never be stored in SQLite or authentication sessions.
- Run `uv run --locked pytest -W error` from this directory. Tests use isolated databases outside their static-file directories. Follow the root's practical 80% testing policy; prioritize authentication and data boundaries over percentage-driven tests.
