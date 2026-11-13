# Forma

Single-board Kanban demo: five renameable columns; add, delete, and drag cards to reorder within or move between columns. Use a card's grip handle, or focus it and press Space, arrow keys, then Space to drop (Escape cancels). Changes currently reset on refresh. FastAPI serves the static Next.js build and API from one Docker container.

Sign in with username `user` and password `password`. Sessions last up to eight hours and survive page refresh; sign out or restart the server to end a session. Board changes currently reset on refresh or sign-out. Authentication is the local MVP placeholder; registration and database storage are not implemented yet.

Requires Docker with Compose v2 or newer, running with Linux containers.

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

Open http://127.0.0.1:8000. Stop preserves the `forma_board-data` volume reserved for SQLite. Database storage is not implemented yet.

Health API: http://127.0.0.1:8000/api/health (also available at `/health`). Both return `{"status":"ok"}`.

Hello API: http://127.0.0.1:8000/api/hello (also available at `/hello`). Both return `{"message":"Hello, world!"}`.

For later AI integration, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The key is optional for the demo and passed to the container only at runtime.

Backend tests: `cd backend` then `uv run --locked pytest` (requires uv and Python 3.14; uv can install Python).

Container browser tests, from `frontend/` with the container running:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:8000'
npm run test:e2e
npx playwright test --config playwright.scaffold.config.ts
```

On macOS/Linux, use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npm run test:e2e` for the board suite; the second command is unchanged.

Frontend development (keep the Docker backend running; development API calls are proxied to port 8000):

```sh
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000.

Validation: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Browser setup: `npx playwright install chromium`. With `PLAYWRIGHT_BASE_URL` unset, `npm run test:e2e` launches an isolated development server on port 3100. Production uses the static export in `frontend/out/`; no Next.js runtime server is needed.
