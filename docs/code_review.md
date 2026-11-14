# Code Review — Forma Kanban App

Comprehensive review of the full repository. Findings are grouped by area and ranked
Critical > High > Medium > Low. Each item cites the relevant file and line.

---

## Executive Summary

The codebase is well-structured, secure against the common web vulnerabilities (SQL
injection, XSS), and backed by a thorough test suite (116 backend, 37 frontend unit,
27+ E2E). Pydantic strict mode with `extra="forbid"`, parameterised SQL, React's
default escaping, `SameSite=Strict` / `HttpOnly` cookies, and revision-based
optimistic concurrency are all solid choices.

The main areas for improvement are hardening the Docker image (non-root user), adding
UX safeguards (delete confirmation), improving accessibility announcements for
drag-and-drop, and tightening a few correctness edge cases.

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 2     |
| Medium   | 14    |
| Low      | 25    |

---

## 1 — Security

### [Critical] SEC-1: Hardcoded credentials with no override mechanism
`backend/app/auth.py:49` — Username `user` and password `password` are string
literals. There is no environment-variable or config-file override. Anyone who reads
the source knows the login. Acceptable only as a demo; a production deployment must
source credentials externally.

### [High] SEC-2: Container runs as root
`Dockerfile` — The final stage never creates or switches to a non-root user. A
container-escape or application vulnerability grants root access.
**Fix:** Add `RUN adduser --disabled-password --no-create-home appuser && chown -R appuser /app /data`
and `USER appuser` before `CMD`.

### [High] SEC-3: In-memory sessions with no persistence or sharing
`backend/app/main.py:36` — Sessions live in a plain `dict`. A restart logs everyone
out; multi-worker deployments (`--workers N`) would not share sessions. Documented as
a known constraint but limits any path to production.

### [Medium] SEC-4: No password hashing
`backend/app/auth.py:49` — Plaintext comparison. Even for one hardcoded user, any
future migration to stored credentials requires a full rewrite.

### [Medium] SEC-5: CSRF protection relies on `Sec-Fetch-Site` header only
`backend/app/main.py:58-61` — Non-browser clients and older browsers that omit
`Sec-Fetch-Site` bypass the check. Combined with `SameSite=Strict` cookies this is
reasonable, but a dedicated CSRF token would add defence-in-depth.

### [Medium] SEC-6: No rate limiting on login
`backend/app/auth.py:47-63` — No rate limit, lockout, or backoff. With known
credentials this is low-risk, but any credential upgrade would need this.

### [Low] SEC-7: Expired sessions never garbage-collected
`backend/app/auth.py:37-38` — Stale entries are cleaned only on access. A
long-running server accumulates dead sessions indefinitely.

### [Low] SEC-8: Cookie `Secure` flag depends on request scheme
`backend/app/auth.py:61` — Behind a TLS-terminating proxy without `X-Forwarded-Proto`
the flag would be `false`, sending the cookie over cleartext.

### [Low] SEC-9: API key read from environment on every request
`backend/app/openrouter.py:33` — Minor: reading once at startup and storing in app
state would reduce the exposure window.

### [Low] SEC-10: No Content Security Policy headers
`frontend/next.config.ts` — No CSP configured. The static export serves no custom
headers; the FastAPI backend would need to add them.

### [Low] SEC-11: No CSRF token on frontend requests
`frontend/app/auth.tsx:69`, `frontend/app/use-board.ts:13-18` — All mutating requests
rely solely on `SameSite=Strict` cookies. Adequate for modern browsers.

---

## 2 — Correctness

### [Medium] COR-1: Shadow import — `HTTPException` from `http.client`
`backend/app/openrouter.py:3` — Imports `http.client.HTTPException`, which shadows
`fastapi.HTTPException` by name. Correct in this context (catching stdlib HTTP errors
from `urlopen`) but a maintenance trap if someone adds the FastAPI import later.
**Fix:** Alias the import: `from http.client import HTTPException as StdlibHTTPException`.

### [Medium] COR-2: TOCTOU race in `save_board`
`backend/app/database.py:93-105` — After `UPDATE ... WHERE revision = ?` returns
`rowcount == 0`, a `SELECT` distinguishes "not found" from "conflict". Another thread
could delete the board between the two statements. Benign in practice (boards are
never deleted) but theoretically racy.

### [Medium] COR-3: `moveCard` intra-column index semantics
`frontend/app/board.ts:25-31` — When moving a card to a higher index within the same
column, the card is filtered out first, shifting indices. `targetIndex` then means
different things for intra- vs inter-column moves. The DnD handler compensates, but
reusing `moveCard` with a different caller convention could misplace cards.

### [Medium] COR-4: Stale `messages` closure in `sendMessage`
`frontend/app/use-board.ts:105-142` — `sendMessage` captures `messages` from the
render closure. The `writing.current` mutex prevents concurrent sends, but if the
guard were ever relaxed, messages could be lost. The mutex is also never reset if the
component unmounts mid-flight.

### [Medium] COR-5: `save` compares columns by reference identity
`frontend/app/use-board.ts:66` — `columns === current.current.board.columns` is a
reference check. After conflict recovery the local `columns` array will never be `===`
to the recovered document's columns, causing a redundant PUT.

### [Medium] COR-6: `.env.example` uses non-standard format
`.env.example:2` — Contains `OPENROUTER_API_KEY` with no `=` sign. Most `.env`
parsers expect `KEY=value`. Copying this file to `.env` leaves the variable undefined.
**Fix:** Change to `OPENROUTER_API_KEY=`.

### [Low] COR-7: `ensure_user_board` reads seed from disk on every call
`backend/app/database.py:55` — `seed.json` is parsed on each call. Caching the parsed
result would avoid repeated I/O.

### [Low] COR-8: New connection opened per database operation
`backend/app/database.py:41-46` — No connection pooling or reuse. Fine for low
traffic but each request may open 1-3 connections.

### [Low] COR-9: `protect_browser_requests` uses fragile path matching
`backend/app/main.py:64` — Routes that need `Cache-Control: no-store` are listed by
string prefix. New API routes require manual updates. Applying `no-store` to all
`/api/` responses would be simpler.

### [Low] COR-10: `unknown_api` iterates all routes on every 404/405
`backend/app/main.py:86-97` — Loops over all registered routes to compute the `Allow`
header. Unnecessary work on every unmatched request.

### [Low] COR-11: `board[4]?.cards.length` hardcodes "done" index
`frontend/app/board-view.tsx:123` — A lookup by `column.id === "done"` would be more
robust than a magic index.

### [Low] COR-12: `controller.current!` non-null assertion
`frontend/app/use-board.ts:40,67,107` — Asserted non-null but starts as `null`.
Guards prevent early access in practice.

---

## 3 — Infrastructure & Docker

### [Medium] INF-1: No `restart` policy in compose.yaml
`compose.yaml` — If the container crashes it stays down.
**Fix:** Add `restart: unless-stopped`.

### [Medium] INF-2: uv binary left in final Docker image
`Dockerfile:12` — `/uv` and `/uvx` (~30 MB) are only needed during `uv sync` but
remain in the final image.
**Fix:** Remove after sync or use a three-stage build.

### [Medium] INF-3: No backup mechanism for board data
`compose.yaml:23-24` — The `board-data` volume is the only persistence layer.
`docker compose down -v` permanently deletes all data with no documented recovery.

### [Medium] INF-4: Playwright `fullyParallel: true` with `workers: 1`
`frontend/playwright.config.ts:8-9` — These contradict each other; net effect is
serial execution. Remove `fullyParallel` or increase workers to match intent.

### [Low] INF-5: Frontend build stage uses floating `node:26-slim`
`Dockerfile:1` — Different patch versions could produce different outputs. Pin to a
specific version for reproducibility.

### [Low] INF-6: Cloudflare DNS hardcoded
`compose.yaml:8-10` — Overrides system DNS; may conflict with corporate policies.

### [Low] INF-7: Scaffold Playwright config lacks explicit timeouts
`frontend/playwright.scaffold.config.ts` — Relies on Playwright defaults. Explicit
timeouts would prevent flaky CI.

### [Low] INF-8: Vitest timeout is 20 seconds
`frontend/vitest.config.mts:2` — Generous for unit tests; may mask slow tests.

### [Low] INF-9: E2E fixtures import from outside `frontend/`
`frontend/e2e/fixtures.ts:2` — Imports `../../docs/board.example.json`. A missing or
changed file gives an opaque import error.

---

## 4 — Code Quality

### [Low] QUA-1: `/hello` and `/api/hello` appear to be leftover scaffolding
`backend/app/main.py:75-80` — Serve no functional purpose. Tested but add unnecessary
surface area.

### [Low] QUA-2: `User` model shape defined in two places
`backend/app/auth.py:18-20` and `backend/app/database.py:61-63` — The user dict shape
is implicit in the database layer and explicit in the Pydantic model. Minor DRY
concern.

### [Low] QUA-3: `CardForm` trims `title` but not `details`
`frontend/app/board-view.tsx:33` — Likely intentional (preserve formatting) but
inconsistent.

### [Low] QUA-4: `onDelete` is fire-and-forget; other actions await
`frontend/app/board-view.tsx:128` — Uses `void save(...)` while `onAdd`, `onEdit`,
`onRename` are awaited. Intentional (no form to hold open) but inconsistent.

### [Low] QUA-5: Very long single-expression JSX lines
`frontend/app/board-view.tsx:128-129` — Several lines exceed 300 characters, making
review difficult.

---

## 5 — Performance

### [Low] PERF-1: AI chat endpoint blocks a threadpool thread for up to 45 s
`backend/app/chat.py:88`, `backend/app/openrouter.py:54` — Sync endpoint calling
`urlopen` with a 45-second timeout. Each pending request holds a threadpool thread.
Under load this could exhaust the default pool (40 threads).

### [Low] PERF-2: Board serialised twice per chat request
`backend/app/chat.py:61-62` — `model_dump()` + `json.dumps()` when the raw JSON
string is already stored in the database. Minor at this scale.

### [Low] PERF-3: `keyboardCoordinates` recreated on every render
`frontend/app/board-view.tsx:93-110` — A plain function capturing `board`. Wrapping in
`useCallback([board])` would be more idiomatic.

---

## 6 — Accessibility

### [Medium] A11Y-1: No delete confirmation
`frontend/app/board-view.tsx:128` — `onDelete` fires immediately with no confirmation.
A misclick permanently removes a card and there is no undo.

### [Medium] A11Y-2: Drag-and-drop uses generic screen-reader announcements
`frontend/app/board-view.tsx:128` — `DndContext` does not provide custom
`announcements`. Users hear IDs like "over droppable area c4" instead of card titles
and column names.

### [Low] A11Y-3: No `aria-roledescription` on sortable cards
`frontend/app/board-view.tsx:52-59` — Screen readers get the generic "article" role
instead of "card".

### [Low] A11Y-4: Focus not moved to error banners
`frontend/app/board-view.tsx:127` — Board errors appear without programmatic focus.
Screen-reader users may miss them.

### [Low] A11Y-5: No `aria-busy` on board during save/load
`frontend/app/board-view.tsx` — The sign-in form has `aria-busy`; the board area does
not. The footer live region partially compensates.

---

## 7 — Testing Gaps

### [Medium] TEST-1: No unit tests for `useBoard` hook in isolation
`frontend/tests/` — The hook is tested only through the full `ProjectBoard` component.
Edge cases (abort signals, the `writing.current` mutex, recovery) would be easier to
test via `renderHook`.

### [Medium] TEST-2: No unit test for successful chat response
`frontend/tests/page.test.tsx` — Only the chat failure path is tested (line 203). No
mock of a successful `/api/chat` response that verifies message appending.

### [Medium] TEST-3: No test for maximum board/payload size
`backend/tests/` — No tests for boards with hundreds of cards or multi-megabyte
details. A malicious user could submit oversized payloads.

### [Low] TEST-4: `provider_error` mapping not directly unit-tested
`backend/app/openrouter.py:20-29` — The mapping is covered indirectly by chat tests
but has no dedicated assertions.

### [Low] TEST-5: Mock API resolves synchronously
`frontend/tests/board-api.ts` — Default responses are instant, so tests never see the
`pending` UI state for more than a microtask.

### [Low] TEST-6: No test for session expiry timer cleanup
`frontend/app/auth.tsx:38-39` — The `setTimeout` cleanup on unmount is not explicitly
tested.

---

## Recommended Actions (priority order)

1. **SEC-1 / SEC-2:** Add a non-root user to the Dockerfile and plan a credential
   override mechanism (env vars or secrets file).
2. **A11Y-1:** Add a confirmation step before card deletion.
3. **COR-1:** Alias the `http.client.HTTPException` import to avoid shadowing.
4. **COR-6:** Fix `.env.example` to use `KEY=value` format.
5. **INF-1:** Add `restart: unless-stopped` to compose.yaml.
6. **A11Y-2:** Provide custom drag-and-drop screen-reader announcements.
7. **TEST-1 / TEST-2:** Add isolated `useBoard` hook tests and a chat success-path
   unit test.
8. **TEST-3:** Add a backend test for oversized board payloads.
9. **INF-2:** Remove uv binary from the final Docker image.
10. **COR-5:** Use structural equality for the save no-op check.
