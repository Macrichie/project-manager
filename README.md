# Forma

Single-board Kanban app: five renameable columns; add, edit, delete, and drag cards to reorder within or move between columns. Use a card's grip handle, or focus it and press Space, arrow keys, then Space to drop (Escape cancels). FastAPI serves the static Next.js build and API from one Docker container.

Sign in with username `user` and password `password` (override with `FORMA_USERNAME` and `FORMA_PASSWORD` environment variables). Sessions last up to eight hours and survive page refresh and container restart; sign out to end a session. Failed login attempts are rate-limited. All board changes save to SQLite and survive refresh, sign-out, and container restart. Saving pauses other changes; conflicts reload saved work and keep open form text for review. Registration is not implemented.

Choose **AI assistant** in the board toolbar to ask questions or create, edit, move, and reorder cards. Valid changes save automatically. The panel sits beside the board on desktop and above it on mobile. Chat stays in this page's memory only: refresh, sign-out, or losing your session clears it; separate tabs have separate conversations. Enter sends, Shift+Enter adds a line, and Escape closes the panel.

Requires Docker with Compose v2 or newer, running with Linux containers.

The app container uses Cloudflare DNS (`1.1.1.1`, `1.0.0.1`) for provider hostname resolution.

Start/stop on Windows:

```powershell
./scripts/start.ps1
./scripts/stop.ps1
```

Start/stop on macOS or Linux:

```sh
bash scripts/start.sh
bash scripts/stop.sh
```

Open http://127.0.0.1:8000. SQLite is created and seeded once at `/data/kanban.db`; stop/start preserves the `forma_board-data` volume and saved board.

Authenticated `GET /api/board` returns `{revision, board}`; `PUT /api/board` accepts the same envelope and returns the saved board with an incremented revision. Stale writes return 409. See [database design](docs/DATABASE.md). Direct backend runs use `backend/data/kanban.db` unless `DATABASE_PATH` is set.

Health API: http://127.0.0.1:8000/api/health (also available at `/health`). Both return `{"status":"ok"}`.

Hello API: http://127.0.0.1:8000/api/hello (also available at `/hello`). Both return `{"message":"Hello, world!"}`.

For AI replies, copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, and recreate the container with the start script. The key is optional for manual board use and passed to the container only at runtime.

After signing in, `POST /api/chat` accepts `message` and optional `history` (a list of `{role: "user" | "assistant", content: string}`). Responses contain `reply`, `updated`, `revision`, and the saved `board`; conflicts return 409 without an assistant success reply. The UI applies saved state directly, pauses overlapping writes, and retains a failed request for review before retrying. History is supplied per request and never stored.

Requests use hardcoded `openai/gpt-oss-120b` with strict structured output, a 45-second network timeout, an 8,192-token completion budget for full-board replies, temperature zero, and no automatic retries. Invalid or truncated responses save nothing.

Opening `/api/chat` in the browser sends GET, which returns 405 with `Allow: POST`. To test, open http://127.0.0.1:8000/docs, execute POST `/api/auth/login` with `user` / `password`, then POST `/api/chat` with `{"message":"What is 2+2? Reply with just the number.","history":[]}`. Try `{"message":"Move card c1 to Done","history":[]}` for a saved board change.

Backend tests: `cd backend` then `uv run --locked pytest` (requires uv and Python 3.14; uv can install Python).

Explicit live AI tests: from `backend/`, run `uv run --locked --env-file ../.env pytest tests/live_chat.py -W error`. These make real paid provider calls with isolated temporary boards. They are excluded from the default suite and do not change your running board.

Container browser tests, from `frontend/` with the container running:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8000'
npm run test:e2e
npx playwright test --config playwright.scaffold.config.ts
```

On macOS/Linux, use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npm run test:e2e` for the board suite; the second command is unchanged.

Board/auth browser tests run serially with temporary seed data and restore the previous board afterward. Use an isolated container/database for integration runs; `PLAYWRIGHT_BASE_URL` selects it for both suites.

Set `PLAYWRIGHT_LIVE_AI=1` to include real paid sidebar workflows. `PLAYWRIGHT_NO_AI_URL` can point to a second isolated instance without a key to verify error feedback and manual use. No provider replies are mocked; ordinary browser runs skip live model calls.

For the explicit restart test, also set `PLAYWRIGHT_RESTART_CONTAINER` to that isolated container's name and run `npx playwright test e2e/restart.spec.ts --project desktop`. With live AI enabled, it verifies both manual and AI changes survive restart while chat clears.

Frontend development (keep the Docker backend running; development API calls are proxied to port 8000):

```sh
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000.

Validation: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Browser setup: `npx playwright install chromium`. With `PLAYWRIGHT_BASE_URL` unset, `npm run test:e2e` launches an isolated development server on port 3100. Production uses the static export in `frontend/out/`; no Next.js runtime server is needed.
