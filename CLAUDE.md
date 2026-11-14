# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forma is a single-board Kanban app with five fixed columns, drag-and-drop cards, and an AI chat assistant. FastAPI serves a static Next.js export and the API from one Docker container. SQLite stores board state with optimistic concurrency (revision-based conflict detection returning 409).

## Architecture

**Backend** (`backend/`): Python 3.14, FastAPI, uv for dependency management.
- `app/main.py` — App factory (`create_app`), mounts API routers + static files, exception handlers, cross-site middleware
- `app/auth.py` — Cookie-based sessions (in-memory dict, 8h expiry). Hardcoded `user`/`password` credentials
- `app/boards.py` — `GET /api/board`, `PUT /api/board` with revision-based conflict detection
- `app/chat.py` — `POST /api/chat` with system prompt, structured output schema, board save on AI changes
- `app/openrouter.py` — OpenRouter API client using stdlib `urllib` (no httpx). Model: `openai/gpt-oss-120b`
- `app/models.py` — Pydantic models: `Board`, `Column`, `Card`, `BoardDocument`. Board enforces exactly 5 columns in fixed ID order (`ideas`, `todo`, `progress`, `review`, `done`) with unique card IDs
- `app/database.py` — SQLite wrapper with `Database` class. Tables: `users`, `boards`. Seeds from `app/seed.json`

**Frontend** (`frontend/`): Next.js 16, React 19, TypeScript, Tailwind CSS 4, @dnd-kit for drag-and-drop.
- `app/page.tsx` — Main page with auth gate
- `app/auth.tsx` — Sign-in form component
- `app/board-view.tsx` — Board UI with columns, cards, drag-and-drop, AI chat toggle
- `app/board.ts` — Card/Column types, `initialBoard` seed data, `moveCard` utility
- `app/use-board.ts` — Board state hook: load, save, conflict recovery, chat message sending
- `app/chat-panel.tsx` — AI assistant sidebar panel
- Production uses static export (`output: "export"`); dev mode proxies `/api/*` to port 8000

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

- Board always has exactly 5 columns in order: `ideas`, `todo`, `progress`, `review`, `done`. Column names are renameable but IDs and order are fixed.
- Card IDs must be unique across the entire board.
- `PUT /api/board` requires the current `revision` number; stale writes get 409.
- Sessions are in-memory (not persisted across server restarts). Cookie: `forma_session`, path `/api`.
- AI chat history is per-request (not stored server-side) and per-tab in the browser (cleared on refresh).
- The OpenRouter client uses stdlib `urllib`, not `httpx` or `requests`.
- `.env` file at project root holds `OPENROUTER_API_KEY` (optional for manual board use).
