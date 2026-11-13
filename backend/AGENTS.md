# Backend

- `app/main.py` creates FastAPI, installs the authentication router and browser-write checks, then serves the static frontend. Keep API routes ahead of the static mount and retain JSON errors for unknown `/api` routes.
- `app/auth.py` accepts the MVP credentials, issues opaque HttpOnly/SameSite=Strict cookies, and stores sessions in `app.state.sessions`. Sessions expire after eight hours and are revoked on logout or server restart; no database is used yet.
- Protect future board/AI routes with `Annotated[Session, Depends(require_session)]` and derive ownership from `session.user.id`. Never accept a client-supplied identity as authorization.
- Keep board/AI schema work behind the approval gate in `../docs/PLAN.md`. Authentication state and future chat history must remain separate; chat must never be stored in sessions.
- Run `uv run --locked pytest -W error` from this directory. Tests use isolated app instances/static fixtures. Follow the root's practical 80% testing policy; prioritize authentication and data boundaries over percentage-driven tests.
