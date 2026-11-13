# Verification

## 2026-11-13: Part 7, frontend persistence and card editing

All Part 7 criteria are complete. The frontend now reads the authenticated user's saved board and persists add, edit, delete, rename, move, and reorder operations. The main app is running healthy at http://127.0.0.1:8000 with its existing data volume preserved. AI remains in Parts 8-10.

Implementation:

- Added `app/use-board.ts` for loading and full-document saves using the current revision. The UI applies the returned saved document; it never initializes from dummy data. Only one save can run at a time, with loading/saving feedback and paused write controls. Saved board state drives counts and completion.
- Added an inline card editor sharing the add-card form. Titles are trimmed and must be nonblank; details preserve whitespace, Unicode, and newlines. Successful saves close forms and restore focus; Escape/cancel makes no write. Existing dnd-kit pointer/touch/keyboard targeting and cancellation are retained.
- Conflicts reload the authoritative board without resubmitting the stale document. Open form text remains for review and a deliberate retry. Other failed saves also refetch because a lost response can follow a committed write. Failed recovery blocks further changes until reload succeeds. Board API 401 returns to sign-in; unmount aborts pending requests.
- Stabilized the authentication-loss callback so routine session rechecks do not reload the board or discard drafts. Removed refresh-reset messaging and updated README/frontend guidance.

| Check | Result |
| --- | --- |
| `npm test` | 32 passed across 3 files: retained move/auth/component coverage plus 9 new cases covering board loading/retry, editing/validation, pending-save serialization, conflict/draft recovery, ambiguous network outcomes, blocked recovery/reload, and board API authentication loss. |
| `npm run lint` / `npm run typecheck` | Passed. |
| Production Docker build | Passed static export and TypeScript build. No new dependency or Next.js runtime introduced. |
| Board/auth Playwright | 18 passed on desktop/mobile against an isolated container on port 8001; 6 intentional input/device skips. Covered exact order after refresh, logout/login persistence, edit details, rename, deletion of a seed card, empty boards/completion, real two-tab 409 recovery, pointer and keyboard moves/cancel/focus, and mobile touch moves/reordering. |
| Explicit restart Playwright | `PLAYWRIGHT_RESTART_CONTAINER=forma-part7-test`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8001`, `npx playwright test e2e/restart.spec.ts --project desktop`: 1 passed. Browser-edited title/multiline details, renamed column, deleted seed card, and exact reordered card sequence survived restart unchanged; the old session required sign-in again. |
| Deployed main container | Recreated using the built image and the existing volume; Compose reported healthy. All 12 deployment browser checks passed on port 8000, including assets without browser errors, API docs, health/hello aliases, and JSON/static 404 boundaries. |
| Visual review | Reviewed desktop/mobile board captures and the inline desktop editor. Existing layout/colors remain intact, with no page overflow in the browser checks; mobile edit/delete controls are visible. |

Initial verification findings and fixes:

- Lint identified synchronous pending-state updates from the mount effect. Initial loading now uses its existing initial state; only the explicit reload action resets pending/error before fetching. No lint suppression was added.
- A Playwright fixture callback named `use` triggered the React Hook rule; renamed the callback to describe running the test.
- The first full browser run had four failures, all in two new workflows on both devices: a prefilled textarea did not match the exact label-text selector, and a partial column-label selector also matched the Save button. Traces/snapshots showed valid controls and successful preceding saves. Replaced those selectors with exact textbox-role/name queries, scoped the conflict alert to the main content, and reran the full board/auth suite successfully.
- An initial standalone restart smoke attempt sent keyboard movement without waiting for drag activation/target confirmation and stopped before restart on an order assertion. The durable restart test now uses the same activation/target waits as the passing keyboard regressions; it passed without an application drag change.

Integration runs used a separate `forma-part7-test` container and `forma_part7_test_data` volume. Serial board/auth fixtures install the seed temporarily and restore prior board content; the normal app's board was not reset for these tests. The temporary container/volume were removed afterward. The restart scenario is explicitly opt-in so ordinary browser runs do not restart the user's app.

Testing followed the practical approximately 80% policy: reused existing move tests, targeted new behavior and data boundaries, and added no percentage-driven coverage infrastructure. Backend application code was unchanged in this phase; the previously passing 82-test backend suite is recorded under Part 6. Installed Next.js `use-client` guidance was reviewed before implementation.

## 2026-11-13: Part 6, persistent board backend

The user approved the Part 5 design by instructing us to proceed to Part 6. All Part 6 criteria are complete. The backend stores boards in SQLite; frontend persistence remains Part 7, so current UI edits still reset.

Implementation:

- Added strict board models, the packaged approved seed, SQLite storage, and authenticated GET/PUT `/api/board` (including slash aliases). Fixed columns, board-wide unique card IDs, required text/types, and unknown-field rejection are enforced on the server. Valid text and array order are preserved without trimming or arbitrary length caps.
- Startup creates the database/tables and seeds the user and board only when absent. Login reads the actual database user ID. Connections enable foreign keys, commit or roll back, and close explicitly. Sessions remain in memory; no chat data is stored.
- Whole-board saves atomically compare/increment the revision for the authenticated owner. Missing boards return 404, stale writes 409, validation failures 422, and storage/corrupt-data failures a concise 500. Private responses, including these errors and cross-site rejections, use `Cache-Control: no-store`.

| Check | Result |
| --- | --- |
| `cd backend; uv run --locked pytest -W error` | 82 passed: 55 existing tests plus 27 new board/storage cases. No warnings. |
| Board round-trip | Exact seed equality, add/edit/delete, rename, within-column reorder, cross-column insertion, unrelated card preservation, long titles, Unicode/newlines, empty details, logout/login, and database reopening passed. |
| Seed lifecycle | Nested directory/file creation and repeat initialization passed. An intentionally empty board survived a fresh app instance without reseeding; the old session was rejected. Invalid stored data remained unchanged and returned a safe error. |
| Ownership/validation | Two independently authenticated test owners remained isolated. Wrong/extra fields, invalid revisions/types, blank text, duplicate IDs, changed/reordered/missing/extra columns, and absent/forged sessions were rejected without changing saved data. Existing database user ID 42 was resolved correctly at login. |
| Atomicity/conflicts | Two concurrent writers on separate SQLite connections produced exactly one success and one conflict. Stale/cross-site writes and a failing SQL update trigger preserved the last committed board. Missing rows were not recreated by reads/writes. |
| Docker build/start | Static frontend and TypeScript build passed. Recreated the container successfully; Compose reported healthy. |
| Live restart persistence | Saved a renamed/reordered board through HTTP, checked exact read-back and stale-write rejection, restarted the container, verified the old session returned 401, signed in again, and confirmed the saved document/revision remained unchanged. Restored original board content using a revision check. |
| Auth browser regressions | All 4 desktop/mobile checks passed against the container: login, refresh, logout/revocation, and authentication loss. |
| Deployment browser checks | All 12 passed: board/assets without browser errors, health/hello aliases, API documentation, and JSON API/static 404 boundaries. |
| Runtime layout | `/data/kanban.db` exists in the existing mounted volume; the packaged seed is present. Only `users` and `boards` tables exist. No root `.env`, docs directory, or database under the public static directory. |

The initial backend run identified two fixture defects: the new temporary database shared the test static root, causing the existing private-file check to expose it, and one setup connection was not explicitly closed. Separated static/data fixture directories to match deployment and closed the setup connection; all 82 tests then passed with warnings treated as errors. No production static-serving workaround was needed.

Updated the plan, database approval status, backend guidance, and minimal README. Followed the practical testing policy: focused on storage and authentication boundaries, retained existing tests, and added no coverage instrumentation solely for a percentage. Frontend source is unchanged. The container remains healthy at http://127.0.0.1:8000.

Implementation references: [Python SQLite connections and transactions](https://docs.python.org/3.14/library/sqlite3.html), [Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/), [Pydantic validators](https://docs.pydantic.dev/latest/concepts/validators/), and [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/).

## 2026-11-13: Part 5, database proposal

The design in `docs/DATABASE.md` and full seed in `docs/board.example.json` are ready for separate user sign-off. Approval remains unchecked in the plan; no application database, storage module, board endpoint, or frontend integration has been implemented.

- Compared the JSON example directly against the imported `initialBoard` from `frontend/app/board.ts`: all five columns and ten cards match exactly.
- Executed the schema copied from the document in an in-memory SQLite database. Verified foreign keys, one-board-per-user uniqueness, valid-JSON and positive-revision checks, and STRICT column types.
- Exercised initialization twice; existing rows were preserved. Saved an intentionally empty board and initialized again; it remained empty at the same revision.
- Round-tripped the full seed and a renamed/reordered board with a cross-column move and Unicode/multiline details without losing content or array order.
- Created a second test owner and confirmed an update to the first owner left the second board unchanged. Two writes using the same revision produced one successful update and one zero-row stale rejection. A simulated transaction failure rolled back to the last committed board.
- Parsed and checked the complete JSON API example in the document, including the fixed column identities and a renamed, empty board.
- The documented schema also executed successfully in a separate `:memory:` connection inside the existing Docker container. Local SQLite is 3.50.4; container SQLite is 3.46.1. These checks created no persistent database file and did not change the running application.

This was documentation/design validation only. Application suites and coverage instrumentation were not rerun or expanded for documentation changes, following the practical testing policy. File changes are confined to the plan, verification log, database proposal, and JSON example.

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
