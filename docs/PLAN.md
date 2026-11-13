# Project Management MVP plan

## Scope and confirmed decisions

- Keep the existing Next.js frontend and visual design, including the project color scheme.
- One board per user, with exactly five fixed columns that can be renamed. Cards have a title and details only, plus internal identifiers.
- Support adding, editing, deleting, moving cards between columns, and reordering cards within a column.
- Sign in with the MVP credentials `user` / `password`; include logout. Design database ownership for multiple users without adding registration or user management.
- Store each user's board as JSON in SQLite. Column and card order are part of that JSON.
- Seed the existing dummy board once for a new user. Saved changes survive refresh, logout, and container restart.
- Keep AI conversation history in browser memory only for the current page session. Refresh, logout, or closing the page clears it. Do not store chat in SQLite, browser storage, or server sessions.
- Provide an AI chat sidebar that can create, edit, and move multiple cards, including reordering. Valid AI changes apply automatically and persist; no extra approval dialog.
- Use OpenRouter with model `openai/gpt-oss-120b`. Read `OPENROUTER_API_KEY` on the backend only, supplied from the root `.env` at runtime.
- Serve the static Next.js export and FastAPI API from one local Docker container. Use `uv` for Python dependencies and a Docker volume for SQLite.
- No archive, search/filter, additional boards, collaboration, or unrelated features.

## Current status

Reviewed against the implementation and verification notes on 2026-11-13.

- Parts 1-10 are complete. The MVP includes the live assistant sidebar, page-only conversation history, persistent manual/AI board changes, and coordinated saves.
- Implementation through Part 7 was committed and pushed to `origin/master` at `578cb6e` (`feat: persist board changes and add card editing`).
- Final recorded checks: 116 local backend tests, 37 frontend tests, 5 explicit live OpenRouter backend tests, 27 desktop/mobile browser checks including live sidebar and container restart, and 12 deployment checks passed. Seven browser cases were intentionally skipped (six input/device combinations and the desktop-only restart on mobile). Lint, typecheck, and the production Docker build passed. No measured coverage percentage is claimed.
- The last verified app URL is http://127.0.0.1:8000. Detailed results and unavailable platform checks are in [VERIFICATION.md](VERIFICATION.md). Earlier phase entries record results at that phase; this status reflects the completed MVP through Part 10.

## Implemented design decisions

These decisions describe the completed MVP and preserve its simple scope.

| Area | Decision |
| --- | --- |
| Deployment | Build a static Next.js export and serve it with FastAPI in one container, with API routes before static files. Unknown API paths return JSON 404; known API paths with unsupported methods return JSON 405 and the correct `Allow` header. No production Next.js runtime. Development alone proxies `/api/*` to FastAPI. |
| Authentication | Use opaque HttpOnly, SameSite=Strict cookies scoped to `/api`, Secure on HTTPS, with eight-hour server-memory sessions. Logout/restart revokes sessions while preserving saved boards. Resolve the MVP username's actual SQLite ID; ownership comes only from the session. Reject cross-site browser writes and mark private responses `no-store`. |
| Storage | Use two SQLite STRICT tables, `users` and `boards`, with one JSON document and a positive revision per owner. Use standard-library SQLite/JSON and existing Pydantic validation, short-lived connections, foreign keys, and explicit commit/rollback/close; no ORM, connection pool, or migration framework. See [DATABASE.md](DATABASE.md) for the approved schema and contract. |
| Initialization | Create the database at startup using `DATABASE_PATH` (`/data/kanban.db` in the mounted Docker volume; `backend/data/kanban.db` by default locally). Package the approved seed under `backend/app/seed.json`. Seed only absent rows; empty or invalid existing boards are never replaced. Ordinary reads/writes return 404 for a missing board. |
| Board rules | Keep exactly five columns in ID order `ideas`, `todo`, `progress`, `review`, `done`. Require unique nonblank card IDs across the board, nonblank names/titles, strict field types, and no extra fields. Preserve array order and valid text without server trimming or arbitrary length caps. UI forms trim titles/names while preserving details, including whitespace/newlines. The full seed is [board.example.json](board.example.json). |
| Read/write contract | GET/PUT `/api/board` exchange `{revision, board}` for the current owner; no client user/board selector. Replace the small document atomically only when the expected revision matches, incrementing it even for an identical accepted PUT. Stale writes return 409 without overwriting newer work; invalid payloads return 422 and storage failures return concise errors. |
| Frontend saves | Load saved data after authentication and display the server-confirmed response after saving. Pause other write controls and allow one save at a time. Counts and completion come from saved state; there is no unconditional client demo initialization or browser persistence. |
| Failure recovery | Refetch after conflicts and other save failures, since a lost response may follow a committed write. Never automatically resubmit stale data. Retain open form text where its card/column remains mounted for review and deliberate retry. If recovery fails, block further writes until reload succeeds. Board API 401 returns to sign-in; unmount aborts pending requests. |
| Editing and dragging | Reuse one inline form for adding/editing cards. Close forms and restore focus after success; Escape/cancel does not save. Retain dnd-kit pointer/touch/keyboard support, position-aware insertion, and a presentational overlay. Pointer targets follow the pointer; keyboard movement follows card/column order to avoid rotated-overlay geometry errors. |
| Live AI connectivity | Authenticated POST `/api/chat` accepts `{message, history?}` and returns `{reply, updated, revision, board}` from hardcoded `openai/gpt-oss-120b` through OpenRouter Chat Completions. Use strict JSON Schema and `provider.require_parameters: true`, standard-library HTTP/JSON, a 45-second network timeout, and an 8,192-token completion budget for full-board output, and temperature zero to reduce sampling variation. Read the API key from the backend environment per call; no startup call, automatic retry, fallback model, stored chat, or mocked provider responses. Missing configuration leaves manual board use available. |
| AI context and commits | History accepts only user/assistant text and stays request-local. Load only the session owner's authoritative board; close the connection before calling the provider. Validate `AIResult` with a nonblank reply and a nullable complete board. A non-null board is saved atomically against the original revision before returning the reply; stale saves return 409 without an assistant success message. Null means reply-only: reread saved state and do not increment revision. The API always returns saved board/revision plus `updated` for the sidebar. |
| Schema portability | The selected provider treated unanchored `\S` as a one-character constraint. Use the equivalent whole-string nonblank regex `^[\s\S]*\S[\s\S]*$` in shared models so native decoders allow full text/newlines while server validation keeps the approved rule. Reuse the approved board schema; do not relax ownership, fixed columns, unique IDs, strict types, or extra-field rejection. |
| Verification | Reuse meaningful existing tests and target new data/authentication boundaries under the practical approximately 80% policy below. Run board/auth integration tests serially against an isolated SQLite volume; fixtures temporarily install the seed and restore prior content. Container restart testing is explicitly opt-in. |
| Assistant UI and page state | Open the assistant from the toolbar. It sits beside the board on desktop and above it on mobile, with plain-text messages, pending/error feedback, Enter/Shift+Enter controls, and Escape/close focus restoration. Keep the panel mounted while closed; keep history/drafts only in React memory. AuthGate unmount clears them on logout, expiry, or authentication loss; refresh/new tabs start fresh. Only successful user/assistant pairs enter subsequent context. |
| Chat/manual coordination | Use one synchronous request lock for chat and manual saves, disable overlapping write controls, and apply the server-returned board before appending an assistant reply. Keep failed request text for review, refetch saved work after errors/unknown outcomes, and block writes if recovery fails. Never automatically resubmit or fabricate a successful reply. |
| Container DNS | The host/default container resolver stopped resolving `openrouter.ai` during acceptance, while direct public DNS and an isolated container using it succeeded. Configure only the Compose app service with `1.1.1.1` and `1.0.0.1`; no host DNS settings or fixed provider IPs are changed. |
| Model context compatibility | Use one initial system policy message, followed by user/assistant history, then the authoritative saved board and latest question together in the final user message. Controlled live follow-ups failed twice with state before history and passed twice with state after history at temperature zero. Some gpt-oss serving templates ignore later system messages. Explicitly require latest-request-only execution and retain card IDs when moving/editing; shape validation cannot prove natural-language intent. |

Part 9 reuses the strict board model and atomic revision check, releases connections during provider calls, and rejects stale results without claiming they saved. Part 10 connects the sidebar to this contract with page-only chat and coordinated manual saves. No browser storage for chat is used.

## Execution and approval rules

- [x] Review root and directory-specific AGENTS.md files and the existing frontend.
- [x] Record the user's decisions on card reordering, JSON storage, and session-only chat.
- [x] Expand this plan with phase checklists, tests, and success criteria.
- [x] Describe the existing frontend in `frontend/AGENTS.md` while retaining its generated Next.js guidance.
- [x] Obtain user approval of this detailed plan before starting Part 2 (approved 2026-11-13).
- [x] Obtain separate user approval of the proposed database design in Part 5 before implementing Part 6 (approved by the instruction to proceed to Part 6, 2026-11-13).

Work through the parts in order. Check off implementation and verification separately, with concise results recorded here as work completes. Do not mark planned checks as passed. For defects, identify and demonstrate the root cause before changing code. Keep planning and execution documents in `docs/`.

Testing policy (updated at the user's request): aim for approximately 80% coverage of relevant application code where measuring coverage is useful and proportionate. This is a practical target, not a hard gate or a ceiling: do not add redundant tests or coverage infrastructure just to reach a percentage, and do not remove valuable existing tests to reduce coverage. Prioritize critical behavior, authentication boundaries, data preservation, and a small set of meaningful browser workflows. Apply the phase checklists with this policy; run broader checks only when changes or failures justify them.

## Part 1: Plan and baseline

- [x] Inspect the frontend structure, scripts, current board behavior, and test coverage without changing application code.
- [x] Identify missing capabilities: backend, authentication, persistence, card editing, ordering within columns, Docker packaging, and AI chat.
- [x] After plan approval, run existing lint, typecheck, unit tests, production build, and Playwright tests to establish the baseline; record failures and their causes in `docs/VERIFICATION.md`.
- [x] Before implementation, inspect installed Next.js guidance and verify current compatible library versions and OpenRouter documentation. Retain existing libraries where they meet the requirements.

Success criteria:

- [x] The user approves scope, sequence, session semantics, and acceptance conditions.
- [x] Baseline results distinguish existing defects from later regressions.

## Part 2: Scaffolding

- [x] Create a minimal FastAPI application in `backend/` with `pyproject.toml`, a checked-in-ready `uv.lock`, and pytest configuration. No Git repository existed at this phase; it was initialized and pushed after Part 4.
- [x] Add a health API endpoint and temporary static HTML at `/` that calls it.
- [x] Add Docker build infrastructure and Compose configuration for a single application container, initially serving the temporary page.
- [x] Configure a named SQLite data volume and runtime environment injection. Exclude `.env`, database files, dependency directories, build output, and test artifacts from source/build context as appropriate.
- [x] Add a placeholder-only `.env.example`; never read out, copy into images, or commit real credentials.
- [x] Add `scripts/start.ps1` / `stop.ps1` for Windows and `scripts/start.sh` / `stop.sh` for macOS and Linux. Start builds and launches the container; stop preserves the database volume.
- [x] Keep scripts simple, report missing Docker clearly, and document the local URL and commands in a minimal README.

Tests:

- [x] Backend tests prove the health endpoint and temporary page work (6 tests).
- [x] Build and start the container; confirm the page makes a successful API call from a browser (6 desktop/mobile Playwright checks).
- [x] Verify stop/start, volume preservation, and script behavior on available platforms; record any platform that cannot be executed locally (PowerShell and Git Bash on Windows verified; native macOS/Linux unavailable).
- [x] Check that runtime secrets and local data are excluded from the Docker build context (verified using a separate build-context assertion).

Success criteria:

- [x] The scripts launch a working local page and API in one container, and stop it without deleting saved data.

## Part 3: Serve the existing frontend

- [x] Configure Next.js static export using the installed version's documented approach.
- [x] Extend the Docker build to build the frontend in a Node stage and copy its static output into the FastAPI runtime image.
- [x] Serve frontend assets and `/` through FastAPI without intercepting API routes or converting missing API routes to HTML.
- [x] Preserve the five-column demo, dummy cards, typography, colors, responsive layout, and existing interactions.
- [x] Make Playwright configuration support testing the deployed container as well as frontend development, without Windows-only command assumptions (brought forward to Part 2 after the baseline exposed unrelated-server reuse).

Tests:

- [x] Run frontend lint, typecheck, unit tests, and the production static build.
- [x] Test static assets, `/`, the health endpoint, and missing API routes through FastAPI (46 backend tests and 12 deployment checks).
- [x] Run Playwright against the container on desktop and mobile: dummy data, rename, add/delete, cross-column dragging, keyboard movement, cancel, and layout (7 passed; 3 device-specific skips).

Success criteria:

- [x] The existing demo works at `/` in the container with no browser errors or broken assets and no separate Next.js runtime server. See `docs/VERIFICATION.md` for Part 3 results.

## Part 4: MVP sign-in experience

- [x] Add login, logout, and current-user API endpoints with a minimal server-validated session cookie.
- [x] Accept only `user` / `password`; keep credentials and session validation on the backend.
- [x] Show a styled sign-in screen at `/` until the server confirms authentication; display the board after login and provide logout.
- [x] Provide the reusable `require_session` dependency for board and AI routes as they are introduced; ownership comes from `session.user.id`. Board routes added in Part 6 use it; future AI routes must do the same.
- [x] Unmount the board on logout, expiry, or authentication loss, clearing its child state and any future chat state. Authentication sessions store no conversation history.
- [x] Use an HttpOnly, SameSite=Strict cookie scoped to `/api`, with Secure enabled for HTTPS. Reject cross-site API writes using browser fetch metadata; login requires JSON credentials.

Tests:

- [x] Backend tests cover correct and incorrect credentials, missing/invalid sessions, current-user lookup, expiry, token rotation, cross-site writes, and logout invalidation (9 new tests; 55 total passed).
- [x] Frontend tests cover sign-in validation, errors, loading, logout, session restoration, expiry, and authentication loss (6 new tests; 23 total passed).
- [x] Playwright proves unauthenticated visitors see sign-in, valid login opens the board, refresh restores the session, and logout/revocation prevents further authenticated API access (4 auth checks on desktop/mobile). Existing board and deployment checks also passed.

Success criteria:

- [x] The board is available after login, logout works, and unauthenticated visitors receive no board markup or authenticated user response. Static assets and dummy seed code remain public; saved private board data added in Part 6 uses the server guard. Server running on port 8000 at verification; see `docs/VERIFICATION.md`.

## Part 5: Database modeling and approval

- [x] Write `docs/DATABASE.md` proposing a small SQLite schema with users and one uniquely owned board per user, storing the board payload as JSON.
- [x] Document the JSON shape and example in `docs/board.example.json`: five stable column IDs, editable column names, ordered card arrays, stable card IDs, title, and details.
- [x] Specify validation for fixed columns, unique identifiers, nonblank titles/names, and preserved card details and ordering.
- [x] Specify database creation, one-time seed data, transactions, the volume path, and restart behavior. Do not reseed an intentionally empty board.
- [x] Specify how authenticated users map to their own board and how future users can be added without implementing registration now.
- [x] Propose the minimal board read/write API contract and how stale writes, including AI writes, avoid silently overwriting newer changes.
- [x] Explicitly exclude chat messages from the database model.
- [x] Present the proposed schema and JSON example for separate user sign-off (approved 2026-11-13).

Tests and review:

- [x] Check that the proposed JSON represents all existing dummy cards, renamed columns, empty columns, and arbitrary card order without losing data (exact seed comparison and in-memory round-trip checks passed).
- [x] Review the design against one-board ownership, seed-once behavior, persistence, and the session-only chat requirement. In-memory SQL checks passed locally and the documented schema was accepted by container SQLite; see `docs/VERIFICATION.md`.

Success criteria:

- [x] The user approves the documented SQLite and JSON design and API contract before Part 6 (2026-11-13).

## Part 6: Persistent board backend

- [x] Implement only the approved database model and API contract.
- [x] Create the database and tables when absent and seed the MVP user and board once.
- [x] Add authenticated routes to read and update the current user's JSON board, supporting all required card operations and column renaming.
- [x] Validate incoming board changes and save atomically. Keep ownership and fixed-column rules on the server.
- [x] Return useful validation and conflict errors while preserving the last valid saved board on failure.

Tests:

- [x] Use isolated temporary SQLite databases for creation, repeat startup, seed-once behavior, and JSON round-trip tests.
- [x] Cover adding, editing, deleting, moving, ordering within columns, renaming, empty boards, and persistence after reopening the database.
- [x] Cover invalid payloads, duplicate IDs, changed column identities/count, unauthenticated access, and access isolation using two test users.
- [x] Verify failed or stale writes leave saved data intact and successful writes preserve unrelated cards and ordering.

Success criteria:

- [x] API tests prove every required board change persists correctly and each user can access only their own board. All 82 backend tests passed; live Docker restart persistence and 16 desktop/mobile auth/deployment checks passed. Frontend integration was subsequently completed in Part 7 below. See `docs/VERIFICATION.md`.

## Part 7: Connect the frontend and backend

Card sorting was brought forward at the user's request after Part 3. Part 7 now connects all manual operations to SQLite through the authenticated board API.

- [x] Load the board from the API after authentication; remove unconditional client-side demo initialization and refresh-reset messaging.
- [x] Persist add, edit, delete, rename, move, and reorder actions through the approved API. Provide a simple card edit form for title and details.
- [x] Extend existing dnd-kit behavior to place cards at the chosen position within or between columns, including empty columns (brought forward after Part 3 at the user's request).
- [x] Preserve pointer, touch, keyboard, cancel, and focus behavior. Update card counts and completion display from the saved board.
- [x] Add concise loading and save-error feedback; keep the UI consistent with server state after failures and avoid overlapping writes.

Tests:

- [x] Retain the 13 existing board move cases for up/down, first/last positions, cross-column insertion, empty targets, and unchanged moves; verify cancellation in browser workflows. No duplicate unit cases were added for already-covered pure moves.
- [x] Extend component tests for editing, API loading/saving, validation, failure recovery, and authentication loss (32 frontend tests passed).
- [x] Run Playwright against the container for the full CRUD/rename/drag workflow, checking exact card order after refresh and logout/login.
- [x] Verify pointer and keyboard reordering on desktop and touch dragging on mobile; check overflow, long content, empty columns, and focus (18 applicable desktop/mobile checks passed; 6 device-specific skips).
- [x] Restart the container and verify saved titles, details, column names, and ordering remain; confirm deleted seed cards do not return (explicit isolated-container restart browser test passed).

Success criteria:

- [x] All manual board operations work and persist, including ordering within a column; the polished layout remains usable on desktop and mobile. Production build, lint, typecheck, 32 frontend tests, 18 board/auth browser checks, 1 explicit restart check, and 12 deployment checks passed. Main container running healthy on port 8000; see `docs/VERIFICATION.md`.

## Part 8: OpenRouter connectivity

User decisions (2026-11-13): use the real OpenRouter service to verify a model answer, without mocked provider responses; expose authenticated `POST /api/chat`; keep the model hardcoded to `openai/gpt-oss-120b` for now. These replace the original mock-provider test requirement for this part. Future provider verification should also use live calls rather than simulated model replies.

- [x] Add a minimal backend OpenRouter client with runtime API-key configuration, hardcoded model, a finite timeout, and concise error handling.
- [x] Keep the API key out of frontend code, responses, logs, and the image. Missing AI configuration must not prevent manual board use.
- [x] Bring forward authenticated `POST /api/chat` with `{message: string}` requests and `{reply: string}` responses. Part 8 returns a real model reply only; board context/updates and conversation history remain Part 9, and the sidebar remains Part 10.
- [x] Run an explicit `2+2` connectivity check through `/api/chat`; do not run paid calls at startup or during the default automated suite.

Tests:

- [x] Test local authentication, request validation, and missing configuration without mocked provider responses or paid calls (7 new cases; 89 backend tests passed). Provider authentication, credit/rate-limit, timeout/network, malformed/empty/truncated reply, and HTTP-200 error-body handling is implemented; forced provider failures were not exercised live.
- [x] Run the real connectivity check with the configured key through the authenticated API. After the user added the key locally, the request returned HTTP 200 and `{"reply":"4"}` in 0.79 seconds; no credential was displayed.

Success criteria:

- [x] The configured model answers the real connectivity check and failures are reported without affecting saved board data. Verified the saved board and revision were unchanged after the live call; the app remained healthy.

Resolved configuration issue: the first attempt returned 503 because the root `.env` and runtime key were absent. The user added the key locally; recreating the container loaded it and the live check passed. `.env` remains ignored by Git and excluded from the image. Provider rejection/timeout branches are implemented but were not forced live; no mocked model responses were used.

Browser URL follow-up: opening `/api/chat` sends GET, while chat requires POST. The generic API fallback incorrectly masked unsupported methods as 404. Corrected it to return 405 with `Allow: POST` for chat, preserving unknown-path 404 responses. All 94 backend tests passed at that point. Verified real login and chat from the browser `/docs` UI returned `{"reply":"4"}` after deployment, with saved board data unchanged. Part 9 below subsequently extends that response with saved board state.

## Part 9: Structured AI board updates

- [x] Extend the authenticated `/api/chat` endpoint from Part 8 to load the current user's authoritative board and send its JSON, the user's question, and current-session conversation history to the AI.
- [x] Verify the selected model/provider supports the required Structured Outputs contract before depending on it; report any incompatibility instead of silently changing the model. The full schema was accepted live; a nonblank-pattern decoder incompatibility was isolated and corrected without changing the model or relaxing validation.
- [x] Define and test a structured response containing an assistant reply and an optional updated board, reusing the approved board schema.
- [x] Validate provider output before saving. Allow one response to create, edit, move, or reorder multiple cards while preserving fixed columns and ownership.
- [x] Save valid updates atomically and return the saved board with the assistant reply. Reject malformed or stale changes without overwriting the current board or claiming success.
- [x] Accept conversation history per request without persisting it. Avoid logging chat contents or full board payloads.

Tests:

- [x] Verify real AI responses for reply-only output and individual/multiple card changes, including reordering. Test schema rejection and stale-save protection locally without simulating provider replies; record provider failures only when actually exercised. All 116 local backend tests and 5 explicit live provider tests passed.
- [x] Assert each request contains the current saved board, user question, and supplied session history, with no other user's data.
- [x] Assert valid updates persist, invalid updates change nothing, and no chat history is written to SQLite or server sessions.
- [x] Run a small explicit live Structured Outputs check with the configured model after deterministic tests pass. The isolated live suite verifies multi-card changes, reordering, history/current-board context, concurrent manual saves (409), and storage failure rollback (500). The deployed API also returned reply `4`, `updated: false`, and the unchanged saved board/revision.

Success criteria:

- [x] The endpoint returns useful replies and automatically persists only validated board updates, with no persistent chat history. Main container rebuilt and healthy on port 8000; 12 deployment browser checks also passed. See `docs/VERIFICATION.md` for the observed provider issue and live evidence.

## Part 10: AI chat sidebar and final acceptance

- [x] Build a sidebar matching the existing design with a message list, composer, send/pending state, and concise error feedback.
- [x] Make the sidebar usable on mobile without obscuring essential board controls; preserve keyboard access and sensible focus behavior.
- [x] Keep messages in page memory only and send them as conversation context. Clear them on refresh, logout, or authentication loss.
- [x] Apply the saved board returned by chat immediately, updating cards, order, counts, and completion without a page reload.
- [x] Coordinate chat updates with manual saves to avoid applying stale results. On failure, preserve saved work and show a useful error.

Tests:

- [x] Component tests cover composer submission, pending/error feedback, draft retention/reset, and chat/manual serialization. Verify actual reply-only messages, automatic board refresh, and session reset with the live provider in browser tests, honoring the no-mocked-provider decision.
- [x] Playwright with the live provider covers conversational follow-up, multi-card changes, reordering, reply-only answers, and manual edits around a pending chat request. Verify local rejection/error presentation without substituting mocked model replies; record live failures only when actually observed.
- [x] Verify refresh and logout/login clear chat while board changes remain persisted; verify separate tabs do not share history.
- [x] Run the complete backend suite, frontend unit tests, lint, typecheck, and production build.
- [x] Run the full desktop/mobile Playwright suite against a freshly built container, including login, board CRUD, ordering, persistence, and chat.
- [x] Complete a live AI smoke test through the sidebar with the configured model; record actual results and any unavailable platform checks.
- [x] Check the final image excludes secrets, SQLite uses the mounted volume, and normal stop/start preserves the board.
- [x] Update the minimal README with start/stop, environment setup, test commands, dummy credentials, persistence, and temporary chat behavior.
- [x] Record verification results in `docs/`, then leave the container running and confirm its URL and health for the user.

Success criteria:

- [x] The complete MVP works locally in one Docker container, with the existing design preserved and a polished chat sidebar.
- [x] Manual and AI board changes survive refresh and container restart; chat history lasts only for the current page session.
- [x] All required executable checks pass; unavailable platform verification is explicitly identified, and failed or blocked required checks remain open.
- [x] The server is running and ready for the user; no out-of-scope features have been added.

Final acceptance: 116 backend tests, 37 frontend tests, 5 explicit live backend checks, all 27 applicable browser checks (7 intentional skips), and 12 deployment checks passed. Live sidebar replies, conversational follow-up with preserved card identity, automatic saved-board application, separate-tab/refresh/logout chat clearing, shared request locking, conflict recovery, and manual/AI persistence across container restart were verified without mocked provider replies. Lint, typecheck, production export, Docker build, image/secret checks, and final health passed. Native macOS/Linux host verification remains explicitly unavailable. Test containers/volumes were removed; the existing `forma_board-data` volume is retained and the app is healthy on port 8000. Details and observed provider limitations are in [VERIFICATION.md](VERIFICATION.md).
