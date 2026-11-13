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

## Execution and approval rules

- [x] Review root and directory-specific AGENTS.md files and the existing frontend.
- [x] Record the user's decisions on card reordering, JSON storage, and session-only chat.
- [x] Expand this plan with phase checklists, tests, and success criteria.
- [x] Describe the existing frontend in `frontend/AGENTS.md` while retaining its generated Next.js guidance.
- [x] Obtain user approval of this detailed plan before starting Part 2 (approved 2026-11-13).
- [ ] Obtain separate user approval of the proposed database design in Part 5 before implementing Part 6.

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

- [x] Create a minimal FastAPI application in `backend/` with `pyproject.toml`, a checked-in-ready `uv.lock`, and pytest configuration. This workspace has no Git repository, so no commit was created.
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
- [x] Provide the reusable `require_session` dependency for board and AI routes as they are introduced; ownership comes from `session.user.id`. No board/AI API routes exist yet; their phases still require this dependency.
- [x] Unmount the board on logout, expiry, or authentication loss, clearing its child state and any future chat state. Authentication sessions store no conversation history.
- [x] Use an HttpOnly, SameSite=Strict cookie scoped to `/api`, with Secure enabled for HTTPS. Reject cross-site API writes using browser fetch metadata; login requires JSON credentials.

Tests:

- [x] Backend tests cover correct and incorrect credentials, missing/invalid sessions, current-user lookup, expiry, token rotation, cross-site writes, and logout invalidation (9 new tests; 55 total passed).
- [x] Frontend tests cover sign-in validation, errors, loading, logout, session restoration, expiry, and authentication loss (6 new tests; 23 total passed).
- [x] Playwright proves unauthenticated visitors see sign-in, valid login opens the board, refresh restores the session, and logout/revocation prevents further authenticated API access (4 auth checks on desktop/mobile). Existing board and deployment checks also passed.

Success criteria:

- [x] The demo board is available after login, logout works, and unauthenticated visitors receive no board markup or authenticated user response. Static assets and dummy seed code remain public; future private board data must use the server guard. Server running on port 8000; see `docs/VERIFICATION.md`.

## Part 5: Database modeling and approval

- [ ] Write `docs/DATABASE.md` proposing a small SQLite schema with users and one uniquely owned board per user, storing the board payload as JSON.
- [ ] Document the JSON shape and example: five stable column IDs, editable column names, ordered card arrays, stable card IDs, title, and details.
- [ ] Specify validation for fixed columns, unique identifiers, nonblank titles/names, and preserved card details and ordering.
- [ ] Specify database creation, one-time seed data, transactions, the volume path, and restart behavior. Do not reseed an intentionally empty board.
- [ ] Specify how authenticated users map to their own board and how future users can be added without implementing registration now.
- [ ] Propose the minimal board read/write API contract and how stale writes, including AI writes, avoid silently overwriting newer changes.
- [ ] Explicitly exclude chat messages from the database model.
- [ ] Present the proposed schema and JSON example for separate user sign-off. Stop before implementing database storage or board routes.

Tests and review:

- [ ] Check that the proposed JSON represents all existing dummy cards, renamed columns, empty columns, and arbitrary card order without losing data.
- [ ] Review the design against one-board ownership, seed-once behavior, persistence, and the session-only chat requirement.

Success criteria:

- [ ] The user approves the documented SQLite and JSON design and API contract before Part 6.

## Part 6: Persistent board backend

- [ ] Implement only the approved database model and API contract.
- [ ] Create the database and tables when absent and seed the MVP user and board once.
- [ ] Add authenticated routes to read and update the current user's JSON board, supporting all required card operations and column renaming.
- [ ] Validate incoming board changes and save atomically. Keep ownership and fixed-column rules on the server.
- [ ] Return useful validation and conflict errors while preserving the last valid saved board on failure.

Tests:

- [ ] Use isolated temporary SQLite databases for creation, repeat startup, seed-once behavior, and JSON round-trip tests.
- [ ] Cover adding, editing, deleting, moving, ordering within columns, renaming, empty boards, and persistence after reopening the database.
- [ ] Cover invalid payloads, duplicate IDs, changed column identities/count, unauthenticated access, and access isolation using two test users.
- [ ] Verify failed or stale writes leave saved data intact and successful writes preserve unrelated cards and ordering.

Success criteria:

- [ ] API tests prove every required board change persists correctly and each user can access only their own board.

## Part 7: Connect the frontend and backend

Card sorting was brought forward at the user's request after Part 3: the demo now supports ordering within columns and insertion between columns. Persistence and the remaining Part 7 work below are still pending.

- [ ] Load the board from the API after authentication; remove unconditional client-side demo initialization and refresh-reset messaging.
- [ ] Persist add, edit, delete, rename, move, and reorder actions through the approved API. Provide a simple card edit form for title and details.
- [x] Extend existing dnd-kit behavior to place cards at the chosen position within or between columns, including empty columns (brought forward after Part 3 at the user's request).
- [ ] Preserve pointer, touch, keyboard, cancel, and focus behavior. Update card counts and completion display from the saved board.
- [ ] Add concise loading and save-error feedback; keep the UI consistent with server state after failures and avoid overlapping writes.

Tests:

- [ ] Extend board unit tests for moving up/down, first/last positions, cross-column insertion, empty targets, cancellation, and unchanged moves.
- [ ] Extend component tests for editing, API loading/saving, validation, failure recovery, and authentication loss.
- [ ] Run Playwright against the container for the full CRUD/rename/drag workflow, checking exact card order after refresh and logout/login.
- [ ] Verify pointer and keyboard reordering on desktop and touch dragging on mobile; check overflow, long content, empty columns, and focus.
- [ ] Restart the container and verify saved titles, details, column names, and ordering remain; confirm deleted seed cards do not return.

Success criteria:

- [ ] All manual board operations work and persist, including ordering within a column; the polished layout remains usable on desktop and mobile.

## Part 8: OpenRouter connectivity

- [ ] Add a minimal backend OpenRouter client with runtime configuration, the specified model, a finite timeout, and concise error handling.
- [ ] Keep the API key out of frontend code, responses, logs, and the image. Missing AI configuration must not prevent manual board use.
- [ ] Add an explicit, backend-only connectivity check that asks `2+2`; do not run paid calls at startup or during the default automated suite.

Tests:

- [ ] Mock success, missing configuration, authentication failure, timeout, and provider failure in backend tests.
- [ ] Run one real connectivity check with the configured key; record success without exposing credentials. If unavailable, report the blocker and do not claim a pass.

Success criteria:

- [ ] The configured model answers the real connectivity check and failures are reported without affecting saved board data.

## Part 9: Structured AI board updates

- [ ] Add an authenticated chat endpoint that loads the current user's authoritative board and sends its JSON, the user's question, and current-session conversation history to the AI.
- [ ] Verify the selected model/provider supports the required Structured Outputs contract before depending on it; report any incompatibility instead of silently changing the model.
- [ ] Define and test a structured response containing an assistant reply and an optional updated board, reusing the approved board schema.
- [ ] Validate provider output before saving. Allow one response to create, edit, move, or reorder multiple cards while preserving fixed columns and ownership.
- [ ] Save valid updates atomically and return the saved board with the assistant reply. Reject malformed or stale changes without overwriting the current board or claiming success.
- [ ] Accept conversation history per request without persisting it. Avoid logging chat contents or full board payloads.

Tests:

- [ ] Use mocked AI responses for reply-only output, individual and multiple card changes, reordering, malformed JSON, schema violations, stale responses, and provider errors.
- [ ] Assert each request contains the current saved board, user question, and supplied session history, with no other user's data.
- [ ] Assert valid updates persist, invalid updates change nothing, and no chat history is written to SQLite or server sessions.
- [ ] Run a small explicit live Structured Outputs check with the configured model after deterministic tests pass.

Success criteria:

- [ ] The endpoint returns useful replies and automatically persists only validated board updates, with no persistent chat history.

## Part 10: AI chat sidebar and final acceptance

- [ ] Build a sidebar matching the existing design with a message list, composer, send/pending state, and concise error feedback.
- [ ] Make the sidebar usable on mobile without obscuring essential board controls; preserve keyboard access and sensible focus behavior.
- [ ] Keep messages in page memory only and send them as conversation context. Clear them on refresh, logout, or authentication loss.
- [ ] Apply the saved board returned by chat immediately, updating cards, order, counts, and completion without a page reload.
- [ ] Coordinate chat updates with manual saves to avoid applying stale results. On failure, preserve saved work and show a useful error.

Tests:

- [ ] Component tests cover sending, pending/error states, reply-only messages, automatic board refresh, and session reset.
- [ ] Playwright with deterministic provider responses covers conversational follow-up, multi-card changes, reordering, reply-only answers, provider errors, invalid updates, and manual edits around a pending chat request.
- [ ] Verify refresh and logout/login clear chat while board changes remain persisted; verify separate tabs do not share history.
- [ ] Run the complete backend suite, frontend unit tests, lint, typecheck, and production build.
- [ ] Run the full desktop/mobile Playwright suite against a freshly built container, including login, board CRUD, ordering, persistence, and chat.
- [ ] Complete a live AI smoke test through the sidebar with the configured model; record actual results and any unavailable platform checks.
- [ ] Check the final image excludes secrets, SQLite uses the mounted volume, and normal stop/start preserves the board.
- [ ] Update the minimal README with start/stop, environment setup, test commands, dummy credentials, persistence, and temporary chat behavior.
- [ ] Record verification results in `docs/`, then leave the container running and confirm its URL and health for the user.

Success criteria:

- [ ] The complete MVP works locally in one Docker container, with the existing design preserved and a polished chat sidebar.
- [ ] Manual and AI board changes survive refresh and container restart; chat history lasts only for the current page session.
- [ ] All required executable checks pass; unavailable platform verification is explicitly identified, and failed or blocked required checks remain open.
- [ ] The server is running and ready for the user; no out-of-scope features have been added.
