# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forma is a multi-board Kanban project management app with five fixed columns per board, drag-and-drop cards, card metadata (priority, labels, due dates), filtering, user registration, and an AI chat assistant. FastAPI serves a static Next.js export and the API from one Docker container. SQLite stores board state with optimistic concurrency (revision-based conflict detection returning 409).

## Architecture

**Backend** (`backend/`): Python 3.14, FastAPI, uv for dependency management.
- `app/main.py` — App factory (`create_app`), wires routers, middleware, error handlers, catch-all API route, static mount
- `app/middleware.py` — CSRF protection (cross-site + origin check) and cache-control middleware
- `app/errors.py` — Exception handler registration (BoardNotFound, BoardConflict, StoredBoardError, sqlite3.Error)
- `app/health.py` — Health and hello endpoint routers
- `app/auth.py` — Cookie-based sessions (SQLite-backed, 8h expiry, survive restarts). Env-var credentials (`FORMA_USERNAME`/`FORMA_PASSWORD`, default `user`/`password`). User registration with PBKDF2 password hashing. Password change endpoint. Login rate limiting on failed attempts
- `app/boards.py` — Multi-board CRUD: `GET/POST /api/boards`, `GET/PUT/PATCH/DELETE /api/boards/{id}`. Legacy `GET/PUT /api/board` for backward compatibility. Revision-based conflict detection
- `app/chat.py` — `POST /api/boards/{board_id}/chat` with system prompt, structured output schema, board save on AI changes
- `app/openrouter.py` — OpenRouter API client using stdlib `urllib` (no httpx). Model: `openai/gpt-oss-120b`
- `app/models.py` — Pydantic models: `Board`, `Column`, `Card`, `BoardDocument`, `UpdateBoard`. Cards include `priority`, `labels`, `due_date` fields. Board enforces exactly 5 columns in fixed ID order (`ideas`, `todo`, `progress`, `review`, `done`) with unique card IDs
- `app/database.py` — SQLite wrapper with `Database` class. Tables: `users`, `boards`, `sessions`. Multi-board operations (create, list, read, save, update meta, delete). Seeds from `app/seed.json`

**Frontend** (`frontend/`): Next.js 16, React 19, TypeScript, Tailwind CSS 4, @dnd-kit for drag-and-drop.
- `app/page.tsx` — Main page with auth gate and hash-based routing (`#/boards`, `#/boards/{id}`)
- `app/auth.tsx` — Sign-in, registration, password change forms, account menu
- `app/boards-list.tsx` — Board list with create, rename, delete operations
- `app/board-view.tsx` — Board UI with columns, cards, drag-and-drop, card metadata (priority/labels/due dates), filtering (text search, priority, label, due status), AI chat toggle
- `app/board.ts` — Card/Column/BoardMeta types, `initialBoard` seed data, `moveCard` utility
- `app/use-board.ts` — Board state hook: load, save, conflict recovery, chat message sending (takes `boardId` parameter)
- `app/chat-panel.tsx` — AI assistant sidebar panel
- Production uses static export (`output: "export"`); dev mode proxies `/api/*` to port 8000
- Responsive CSS breakpoints: 600px (mobile), 800px (tablet), 1200px, 1500px, 1800px

**Docker**: Single-stage build. `compose.yaml` defines `forma` service on port 8000 with Cloudflare DNS and a `board-data` volume.

## Commands

### Docker (start/stop the app)
```
./scripts/start.ps1    # Windows
./scripts/stop.ps1
bash scripts/start.sh  # macOS/Linux
bash scripts/stop.sh
```

### Backend
```
cd backend
uv run --locked pytest                    # unit tests (default suite)
uv run --locked pytest tests/test_chat.py # single test file
uv run --locked --env-file ../.env pytest tests/live_chat.py -W error  # live AI tests (paid calls)
```

### Frontend
```
cd frontend
npm ci                  # install dependencies
npm run dev             # dev server on :3000 (proxy to backend :8000)
npm test                # vitest unit tests
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm run build           # production static export to out/
```

### E2E tests (Playwright, from `frontend/`)
```
npx playwright install chromium
npm run test:e2e                          # board/auth suite (launches dev server on :3100 if no PLAYWRIGHT_BASE_URL)
npx playwright test --config playwright.scaffold.config.ts  # scaffold suite
```
For container testing: set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000`.
Set `PLAYWRIGHT_LIVE_AI=1` to include AI sidebar workflows.

## Key Constraints

- Each user can have multiple boards. Each board has exactly 5 columns in order: `ideas`, `todo`, `progress`, `review`, `done`. Column names are renameable but IDs and order are fixed.
- Card IDs must be unique across the entire board. Cards have optional `priority` (none/low/medium/high), `labels` (string array), and `due_date` (ISO date string).
- `PUT /api/boards/{id}` requires the current `revision` number; stale writes get 409.
- Legacy `GET/PUT /api/board` endpoints operate on the user's first board for backward compatibility.
- Sessions are SQLite-backed and persist across server restarts. Cookie: `forma_session`, path `/api`.
- Credentials configurable via `FORMA_USERNAME`/`FORMA_PASSWORD` env vars (default `user`/`password`). Users can also register with username/password (PBKDF2 hashed). Failed logins are rate-limited (5 per 60s per IP).
- AI chat history is per-request (not stored server-side) and per-tab in the browser (cleared on refresh).
- The OpenRouter client uses stdlib `urllib`, not `httpx` or `requests`.
- `.env` file at project root holds `OPENROUTER_API_KEY` (optional for manual board use).
- Frontend uses hash-based routing: `#/boards` for board list, `#/boards/{id}` for individual boards.
- Mobile layout stacks columns vertically with scroll-snap; desktop uses horizontal grid.
