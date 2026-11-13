# Verification

## 2026-11-13: Part 4, MVP sign-in

Part 4 is complete. The local app at http://127.0.0.1:8000 now requires sign-in using `user` / `password`. Database design and persistence remain in later phases.

Behavior and implementation:

- Added `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout`. Only the backend accepts the hardcoded credentials. Each successful login creates a random opaque token, rotates any existing token in that browser, and stores the authenticated user and eight-hour deadline in server memory.
- Cookies are HttpOnly, SameSite=Strict, and scoped to `/api`; HTTPS requests receive Secure cookies. Logout deletes the cookie and invalidates its server token. Expired, forged, or revoked tokens receive 401. Auth responses are marked `Cache-Control: no-store`.
- Rejects cross-site API writes using `Sec-Fetch-Site`; login accepts JSON credentials rather than form posts. The reusable `require_session` dependency supplies `session.user.id` to future private routes. No board/AI API was introduced ahead of the database approval gate.
- Added a responsive sign-in screen with loading/error/retry states and a sign-out control. `AuthGate` verifies the session before mounting `ProjectBoard`, restores authentication on refresh, rechecks on returning to the window, and unmounts the board when signed out, expired, or invalidated. Board state resets; session storage contains no chat history. No tokens are stored in local/session storage.
- Moved the existing board into `app/board-view.tsx` without changing its card behavior. The static export initially contains sign-in/loading content, not the board's dummy-card markup. Public assets and bundled dummy data are not private user data; future persisted board data must be served through guarded APIs.
- Development-only Next.js rewrites proxy `/api/*` to FastAPI on port 8000. Production still exports static files and runs without a Next.js server.

| Check | Result |
| --- | --- |
| `uv run --locked pytest -W error` | 55 passed, including 9 auth tests for login, cookie attributes, incorrect credentials, missing/forged tokens, rotation, expiry, logout revocation, JSON-only login, and cross-site writes. |
| `npm test` | 23 passed, including 6 auth component tests for gating/restoration, credential errors, network recovery, logout failure, invalidation, and expiry. |
| `npm run lint` / `npm run typecheck` | Passed. |
| Static builds | Passed locally and in Docker. |
| Board browser regressions against Docker | All 10 applicable cases passed after server login; 6 device-specific cases intentionally skipped. |
| Auth browser checks against Docker | 4 passed on desktop/mobile after correcting selectors to avoid Next.js's separate route announcer and the column-save button. Verified empty-field validation, bad credentials, keyboard submit, refresh, cookie flags, logout, old-token replay rejection, board-state reset, and session loss on focus. |
| Deployment browser checks | 12 passed across desktop/mobile; authenticated board assets loaded without page errors or broken resources, and public health/hello/docs routes and JSON API errors remained intact. |
| Development proxy | One complete desktop sign-in/refresh/logout workflow passed through the Next.js development server and proxied API. |
| Visual review | Reviewed desktop and mobile sign-in captures; no page overflow. The board's existing desktop/mobile layout checks passed. |

The first Compose readiness wait timed out. Inspection afterward showed normal Uvicorn startup and successful health requests, and a repeated readiness check passed without application changes. The running container is healthy and remains on port 8000. Server restart clears the temporary session store, requiring sign-in again.

Testing policy: updated the root instructions and plan to target approximately 80% coverage only where meaningful and proportionate, with no hard percentage gate or ceiling. Existing useful tests were retained; new tests focus on authentication boundaries and user-visible behavior. No coverage instrumentation was added solely to produce a percentage, and no measured coverage percentage is claimed.

References: [FastAPI cookie parameters](https://fastapi.tiangolo.com/tutorial/cookie-params/), [Set-Cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Sec-Fetch-Site](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site), and installed Next.js client-component/rewrites guidance.

## 2026-11-13: card reordering

Implemented card sorting early at the user's request, without implementing the remaining persistence/authentication phases.

- Root cause: cards were only draggable, columns were the only drop targets, and `moveCard` explicitly ignored the source column. Six newly added ordering/insertion cases failed before the fix.
- Added position-aware immutable moves and dnd-kit's sortable preset, with one sorting context per column. Cards now support moving up/down within a column and insertion into another column. The overlay no longer registers a duplicate draggable; card content and unrelated columns are preserved.
- Pointer collision detection uses the actual pointer position, supports empty columns and gaps, and preserves the destination-column highlight. Keyboard arrows follow explicit card/column order because the rotated overlay can distort geometric direction comparisons. Escape cancels without modifying the board, and same-column keyboard drops retain handle focus.
- Browser regression tests assert exact title order for mouse and touch moves in both directions, repeated moves, cross-column insertion, keyboard navigation/focus, and cancellation. They wait for drag activation/announcements and drop-animation completion. Mobile fixtures position both targets away from automatic scroll zones so a fixed synthetic gesture does not unintentionally scroll past its target; automatic scrolling remains enabled in the app.

| Check | Result |
| --- | --- |
| `npm test` | 17 unit/component tests passed, including 8 new ordering/insertion/no-op cases. |
| `npm run lint` / `npm run typecheck` | Passed. |
| Production static builds | Passed locally and in Docker; the final Docker image also passed its TypeScript build. |
| Complete board suite against the rebuilt container | 10 passed; 6 intentionally skipped for incompatible input/device combinations. Covers the new reordering cases and all existing board workflows. |
| Deployment/asset/API browser suite | 12 passed on desktop/mobile, with no page exceptions, console errors, broken assets, or API routing regressions. |
| Running service | Container rebuilt and left healthy at http://127.0.0.1:8000; `/api/health` returned `{"status":"ok"}`. |

Updated the README, frontend instructions, and plan to reflect sorting support. Changes still reset on refresh until the planned persistence work is implemented. The implementation reuses the [dnd-kit sortable preset](https://dndkit.com/legacy/presets/sortable/overview/) compatible with the existing dnd-kit core dependency.

## 2026-11-13: Part 3, frontend served by FastAPI

All Part 3 success criteria are achieved. The running container now serves the actual Kanban demo at http://127.0.0.1:8000, replacing the temporary hello page. Part 4 authentication and later features remain unimplemented; board changes still reset on refresh.

Changes:

- Configured Next.js `output: "export"`. Removed the cache-components and partial-prefetch settings, whose installed documentation requires a Node runtime, and removed the unsupported `next start` script. Board components, dummy data, and CSS are unchanged.
- Added a Node 26 build stage using the existing npm lockfile. Only the generated `out/` files are copied into the Python/FastAPI runtime stage at `/app/static`.
- Mounted Starlette StaticFiles after the existing API routes, with explicit JSON 404 handling for unknown `/api` paths. Retained API documentation and both health/hello aliases. The app factory accepts a static directory so backend tests use isolated file fixtures without depending on frontend build output.
- Initial routing tests caught four trailing-slash failures: the static mount and API fallback matched those paths before automatic redirects. Explicit slash aliases fixed the cause; all four cases pass without redirects.
- Replaced retired hello-page browser expectations with exported-board, asset, API-boundary, and documentation checks. Kept the existing board interaction suite and ran it against the container using `PLAYWRIGHT_BASE_URL`.
- Expanded the Docker input allowlist for frontend source/configuration and lockfiles. Updated setup instructions and frontend documentation.

| Check | Result |
| --- | --- |
| `npm test` | 9 unit/component tests passed. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed locally and in the Linux Docker build; generated the static export. |
| `uv run --locked pytest -W error` | 46 passed, covering static HTML/assets, MIME types, conditional/HEAD requests, missing pages, API boundaries across HTTP methods, health/hello aliases, and private file paths. |
| Board Playwright suite against port 8000 | 7 passed; 3 intentionally skipped for incompatible input/device combinations. Covered dummy data, validation, add/delete, rename, refresh reset, pointer drag/cancel, keyboard movement/cancel, mobile touch dragging, and layout. |
| Deployment Playwright suite | 12 passed across desktop/mobile. No page exceptions, console errors, failed requests, or error responses while loading the board; styling checks passed. Public SVGs, static 404s, JSON API errors, API docs, and all health/hello variants passed. |
| Screenshot review | Reviewed desktop and mobile captures in `frontend/test-results/`; existing visual design and horizontally scrolling mobile board are preserved. |
| Build-context assertion | Passed with only approved frontend/backend inputs; no dependency directories, build output, test results, database files, or environment files included. Temporary inspection image removed afterward. |
| Runtime inspection | Static export present; no Node executable or frontend source tree. PID 1 runs Uvicorn; API configuration and the existing data-volume mount are retained. |
| Running service | Compose reported healthy; both health URLs and both hello URLs returned the expected JSON. Container left running on port 8000. |

References: installed Next.js static-export, cache-components, and partial-prefetch guides; [Starlette StaticFiles](https://starlette.dev/staticfiles/); [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/); [Node release schedule](https://github.com/nodejs/Release).

## 2026-11-13: hello API fix

- Reproduced 404 responses at `/hello` and `/api/hello`; the container logs confirmed those requests. The static hello page existed, but no hello JSON handler was registered.
- Added one handler at `/api/hello`, with `/hello` as an alias, returning `{"message":"Hello, world!"}`. Documented both URLs in the README.
- Added regression cases for both URLs with and without trailing slashes. All 4 failed with 404 before the implementation; afterward, all 13 backend tests passed with warnings treated as errors.
- Rebuilt and restarted the container. Live HTTP checks confirmed all four hello URLs return 200 after normal trailing-slash redirects; both health routes still return `{"status":"ok"}` and the container is healthy.
- All 10 desktop/mobile scaffold browser checks passed, including the new hello regression and existing health/page checks. Left the container running at http://127.0.0.1:8000.

## 2026-11-13: health URL fix

- Reproduced the reported JSON 404 at `/health` and `/health/`; `/api/health` returned 200. Container logs also showed a request to `/health` returning 404, and the running API registered only `/api/health`.
- Added `/health` as an alias of the same health handler, preserving `/api/health` for the page and Docker health check. Documented both URLs in the README.
- Extended backend regression tests to cover both paths with and without a trailing slash. Before the fix, the two `/health` cases failed with 404; afterward, all 9 backend tests passed with warnings treated as errors.
- Rebuilt and restarted the container. Live HTTP checks confirmed all four URLs return 200 and `{"status":"ok"}` after following the normal trailing-slash redirects; Compose reported the container healthy.
- Added a deployed-container regression check for both health URLs. All 8 desktop/mobile scaffold browser checks passed, including the existing page connection, failure feedback, and unknown-route behavior.

## 2026-11-13: baseline and Part 2 scaffolding

The user approved the detailed plan. Part 2 is implemented; the container currently serves a temporary page, not the Kanban frontend. Part 3 and later application features are not implemented.

### Frontend baseline

| Check | Result |
| --- | --- |
| `npm test` | 9 tests passed across 2 files. |
| `npm run lint` | Passed, including the new scaffold browser tests/configuration. |
| `npm run typecheck` | Passed before and after test configuration changes. |
| `npm run build` | Passed; the existing Next.js demo builds successfully. |
| Initial Playwright run | 7 failed, 3 skipped: the original configuration reused an unrelated application on port 3000. |
| Isolated Playwright run, 8 workers | 2 passed, 5 timed out, 3 skipped. |
| Isolated Playwright run, 1 worker | 4 passed, 3 desktop tests timed out, 3 skipped. Mobile workflow, touch dragging, and both layout checks passed. |
| Final Playwright run, 1 worker and 60-second budget | 7 passed, 3 intentionally skipped for incompatible input/device combinations. |

Evidence and changes:

- The first failed snapshot displayed the unrelated BATTLEGROUND application. Port 3000 belonged to an existing Vercel development process; ports 3001 and 3002 were occupied too. Those applications were left running.
- Updated `frontend/playwright.config.ts` to use a dedicated development port (3100 by default), refuse existing-server reuse, choose the launch command for the host OS, and support `PLAYWRIGHT_PORT` / `PLAYWRIGHT_BASE_URL` overrides. Failure traces are retained.
- The serial desktop workflow trace shows navigation alone taking 20.83 seconds of the 30-second test timeout, followed by otherwise progressing actions. This demonstrates insufficient time for that run; it does not establish a card-operation defect. Timing failures remain separate from passing scaffold checks.
- A focused rerun of the three desktop failures with a 90-second timeout passed all 3 (workflow 3.1 seconds, pointer drag/cancel 3.3 seconds, keyboard movement/cancel 20.6 seconds). Configured one worker and a 60-second per-test budget for cold development-server runs; the complete suite then passed all 7 applicable cases. No Kanban application code or test assertions were changed.

### Scaffolding checks

| Check | Result |
| --- | --- |
| `cd backend; uv run --locked pytest -W error` | 6 passed with no warnings. |
| Windows start script | Built the Linux image, started the container, and waited for healthy status. Also verified invocation from `frontend/`. |
| Windows stop script | Removed the application container/network and preserved the data volume. |
| Bash start and stop scripts | Both executed successfully through Git Bash on Windows. |
| Script syntax | Bash syntax and PowerShell parser checks passed. |
| Missing Docker | Both start scripts exited with an actionable message when Docker was absent from PATH. |
| `docker compose config --quiet` | Passed. |
| `npx playwright test --config playwright.scaffold.config.ts` | 6 passed: desktop/mobile page-to-API connection, API failure feedback, and JSON 404 responses. No page errors or horizontal overflow in the connection checks. |
| Volume preservation | Wrote a temporary probe in `/data`, stopped and replaced the container, and read the unchanged probe. Removed only the probe afterward. |
| Build context | A separate Docker build copied the entire available context and asserted only the Dockerfile and approved backend application inputs were present; passed after fixing an ignore rule. |
| Runtime | Verified `DATABASE_PATH=/data/kanban.db`, the API-key environment slot, absence of `/app/.env`, and exclusion of pytest from production dependencies. |
| Final running endpoint | `GET http://127.0.0.1:8000/api/health` returned `{"status":"ok"}`; Compose reported the container healthy. |

Implementation details relevant to verification:

- Python 3.14 runtime, FastAPI 0.162.5, Uvicorn 0.54.0, and Docker uv 0.13.8. Dependencies are resolved in `backend/uv.lock`; development dependencies are excluded from the image installation.
- Initial backend tests exposed Starlette's deprecation of the old `httpx` test client dependency. Replaced it with the documented `httpx2` dependency and reran with warnings treated as errors.
- The first build-context assertion proved that re-including the `backend/` directory also included `.venv`, tests, and caches. Added a subtree exclusion before the explicit application inclusions and reran the assertion successfully.
- The named volume is reserved for the later SQLite implementation. No board database or authentication has been implemented during scaffolding.
- `.env` is optional for this step. No provider requests were made and no real API key was read or copied into an image. Compose passes the configured key at runtime only.
- This workspace has no Git repository; lockfiles and ignore rules exist on disk, but no commit was created.

Limitations:

- Native macOS/Linux script execution was unavailable. Git Bash on Windows and a Linux Docker runtime were exercised; these do not substitute for native host verification.
- Historical Kanban browser failures and the test configuration changes are recorded above. The final demo suite passed; scaffold browser checks exercise the actual container independently.

References consulted before implementation: [FastAPI Docker guide](https://fastapi.tiangolo.com/deployment/docker/), [uv Docker guide](https://docs.astral.sh/uv/guides/integration/docker/), [Starlette TestClient](https://starlette.dev/testclient/), [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs), and the installed Next.js static-export guide under `frontend/node_modules/next/dist/docs/01-app/02-guides/static-exports.md`. New Python dependency versions were checked against the PyPI package metadata before locking.
