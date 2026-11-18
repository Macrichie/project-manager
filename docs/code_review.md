# Code review — Forma Kanban app

Full review of the repository as of 2026-11-14, at commit `42a0a40` ("remediate code
review findings and refactor backend modules"). This report replaces the previous
review (added in that commit), whose Critical/High/Medium findings drove the
remediation. This review therefore evaluates the remediated state and flags what the
remediation itself left inconsistent.

Method: every hand-written source file was read end to end (backend modules and tests,
frontend app and tests, Docker/compose/scripts, docs, and the remediation commit
diff). The default suites were re-run; see Verification.

---

## Verification performed for this review

| Check | Result |
| --- | --- |
| `cd backend && uv run --locked pytest -q -W error` | 121 passed in 9.70s |
| `cd frontend && npm test` | 44 passed (5 files) in 15.44s |
| `npm run lint` / `npm run typecheck` | Pass, no output |
| e2e suites, Docker build, live provider checks | Not re-run here (need a running container/provider); prior results recorded in VERIFICATION.md |

Not covered statically: no browser run of the restart e2e (see H-1; the mismatch is
established from code and history and should be confirmed by a re-run).

---

## Executive summary

The codebase is in strong shape: strict validation everywhere, ownership always
derived from the session, parameterized SQL only, revision-checked atomic saves with
a sound single-writer argument, a well-coordinated frontend save/chat lock, and an
unusually disciplined test suite (121 backend / 44 frontend unit tests pass in about
25 seconds combined). The remediation commit demonstrably fixed the prior review's
findings (non-root container, rate limiting, constant-time comparison, Origin check,
env credentials, payload size limits, delete confirmation, custom announcements,
module refactor).

The remaining work is almost entirely reconciliation: the remediation changed two
behaviors (sessions now persist in SQLite; DnD announcements are custom) but did not
update `e2e/restart.spec.ts`, three working documents still describe the old session
semantics, the newly added payload size caps contradict the approved "no arbitrary
length caps" contract, and the new `FORMA_USERNAME`/`FORMA_PASSWORD` override does not
work end to end.

| Severity | Count |
| --- | --- |
| High | 2 |
| Medium | 2 |
| Low | 7 |
| Nit | 5 |

---

## High

### H-1: `e2e/restart.spec.ts` now contradicts two remediated behaviors

The remediation changed session storage and drag announcements, but this opt-in test —
the only automated browser check of restart persistence — was not updated. It cannot
pass as written:

1. `frontend/e2e/restart.spec.ts:46-48` expects the sign-in screen after
   `docker restart` and re-authenticates. Sessions are now SQLite-backed and survive
   restart (`backend/app/database.py:21-25` and `:117-140`;
   `backend/tests/test_auth.py:100-113` passes), and README.md:5 / CLAUDE.md:77
   document that. With a valid cookie still in the browser, the board will render and
   the `Username` assertion will time out.
2. `frontend/e2e/restart.spec.ts:25` still asserts the default dnd-kit announcement
   text `over droppable area c2`. `frontend/app/board-view.tsx:113-118` now supplies
   custom announcements (`Card "..." over {column name}`), and the same commit already
   loosened the identical assertion in `frontend/e2e/board.spec.ts:30` to `/over /i`
   for exactly this reason. The restart assertion was missed.

**Action:** update restart.spec.ts to expect the restored session/board after restart
(or to sign out first if a signed-out restart scenario is wanted) and to expect the
custom announcement text; then re-run the explicit restart check against an isolated
container so VERIFICATION.md reflects the new behavior.

### H-2: Payload size caps silently contradict the approved contract

The remediation added size limits (`backend/app/models.py:14-26`: card id <= 100,
title <= 5000, details <= 50000, column name <= 200, at most 100 cards per column)
with a supporting test (`backend/tests/test_board.py:243-253`). But the approved
documents say the opposite and were not updated:

- `docs/DATABASE.md:47`: "Add no arbitrary title/detail length limit; the existing
  long-title behavior must continue to work."
- `docs/PLAN.md:36`: "...without server trimming or arbitrary length caps."

User-visible consequences: a legitimate board past any cap now returns 422 and cannot
be saved, and AI full-board replies that exceed a cap fail validation and return 502
"AI returned invalid board data" (`backend/app/chat.py:71-75`) — the system prompt
does not tell the model about the caps. The change was deliberate (commit message:
"board payload size limits"), but it is an unrecorded contract change.

**Action:** pick one truth. Either revert the caps to restore the approved behavior,
or keep them and record the decision (limits, rationale, effect on AI replies) in
DATABASE.md and PLAN.md.

---

## Medium

### M-1: Session-persistence documentation drift (security posture statement)

Implementation: sessions live in the SQLite `sessions` table and survive restart;
only expired rows are cleaned at startup (`backend/app/main.py:32`,
`backend/app/database.py:117-140`). Three working documents still describe the old
in-memory design:

- `docs/PLAN.md:33`: "eight-hour server-memory sessions. Logout/restart revokes
  sessions..."
- `docs/DATABASE.md:60`: "Keep authentication sessions in memory. Restarting the
  server requires signing in again..."
- `backend/AGENTS.md`: "sessions stay in `app.state.sessions` ... revoked on logout
  or server restart."

README.md and CLAUDE.md already describe the implemented behavior. This is more than
cosmetic: whether a stolen token survives a container restart is a security property,
and the documents disagree.

**Action:** update the three documents to the SQLite-backed semantics (or revert the
code if restart-revocation was the intended posture — but then H-1, README, and
CLAUDE.md must flip back too; choose one truth and make everything match).

### M-2: `FORMA_USERNAME`/`FORMA_PASSWORD` override is documented but broken

README.md:5 and CLAUDE.md advertise the credential override. However
`Database.initialize()` always seeds only the hardcoded username `user`
(`backend/app/database.py:57`), so with `FORMA_USERNAME=admin` a correct login finds
no user row and returns 500 "Sign-in data is unavailable" (`backend/app/auth.py:91-93`).
The test only passes because it seeds the user manually
(`backend/tests/test_auth.py:85`).

**Action:** in `initialize()`, seed the configured username (read
`FORMA_USERNAME` there too), or drop the override from README/CLAUDE.md and the code
to keep the MVP simple.

---

## Low

1. **Login rate-limit state grows unboundedly** — `backend/app/auth.py:59-77` with
   `app.state.login_attempts` (`backend/app/main.py:37`): entries are keyed by client
   IP and pruned only when the same IP retries; successful logins never clear them.
   A scanner can grow the dict without bound. Localhost exposure is low; add a
   periodic sweep or cap entries.
2. **Expired sessions are purged only at startup or on access**
   (`backend/app/database.py:138-140`): rows for tokens never presented again
   accumulate between restarts. Acceptable for the MVP; worth a note or a periodic
   sweep.
3. **Login rotation order can log a user out on storage failure** —
   `backend/app/auth.py:94-97` deletes the old session before creating the new one;
   if creation fails, the current session is already revoked. Create the new session
   first, then delete the old.
4. **OpenRouter inline error mapping handles only integer codes** —
   `backend/app/openrouter.py:73-76`; string codes (e.g. `insufficient_credits`)
   collapse to the generic 502 message instead of the tailored 503s.
5. **Storage-error wording is board-specific** — `backend/app/errors.py:20-23`
   returns "Board storage is unavailable" for any `sqlite3.Error`, including
   auth/session operations. Use a storage-agnostic detail.
6. **`.claude/settings.local.json` is tracked in git** — a personal tool-permissions
   file that is conventionally gitignored. Untrack it and add it to `.gitignore`.
   Related working-tree state to resolve deliberately: an unstaged deletion of
   `docs/code_review.md` (this file replaces it) and a modified
   `.claude/settings.local.json`.
7. **Stale verification counts in agent-facing docs** — VERIFICATION.md:13-23,
   PLAN.md:23-265, and backend/AGENTS.md still say 116 backend / 37 frontend tests;
   measured today: 121 and 44. Historical dated entries are fine, but PLAN.md's
   "Current status" and backend/AGENTS.md are what agents read. Refresh after the
   next full verification run (including the fixed restart e2e).

Also noted: `frontend/package.json:28` pins `@types/node` to `^20` while the
build/runtime is Node 26; align the major.

---

## Nit

1. `frontend/app/board-view.tsx:131` derives the Done count from `board[4]` by index
   instead of the fixed column id; safe under server validation but implicit. Prefer
   `board.find(c => c.id === "done")`.
2. `backend/app/health.py:14-18` keeps the scaffolding `/api/hello` endpoint. Under
   the "no extra features" standard it is a candidate for removal (removal touches
   README, backend tests, and the scaffold e2e spec).
3. `frontend/app/use-board.ts:133-138` appends its own "Reload the board..." guidance
   to the server's 409 detail, which already says "Reload it before saving again" —
   one message, two reload instructions.
4. `CLAUDE.md:32` says "Single-stage build"; the Dockerfile is two-stage (Node 26
   build stage + Python 3.14 runtime stage).
5. Chat history is sent unbounded (`frontend/app/use-board.ts:118`); long sessions
   balloon provider requests. The plan does not require truncation; a soft cap is a
   reasonable future tweak.

---

## What is solid (leave alone)

- **Validation and ownership**: strict Pydantic models with `extra="forbid"`
  (`backend/app/models.py:11`), fixed column order and unique card IDs enforced in
  one place, ownership always from `session.user.id`, no client-supplied identity
  accepted anywhere.
- **Concurrency core**: revision-checked atomic UPDATE with a correct lock argument
  (`backend/app/database.py:97-113`), plus a concurrent-writers test
  (`backend/tests/test_board.py:164-184`); frontend serializes chat and manual saves
  behind one lock and refetches after any failure without auto-resubmit
  (`frontend/app/use-board.ts`); stale AI candidates return 409 before any success
  reply (`backend/app/chat.py:78-83`).
- **Auth posture**: opaque 32-byte tokens, HttpOnly SameSite=Strict cookie scoped to
  `/api`, rotation on login, cross-site write rejection via fetch metadata plus an
  Origin check, `no-store` on private responses, constant-time credential
  comparison, rate limiting on failed logins.
- **Secrets and packaging**: API key read at call time only, never logged or sent to
  the client; non-root single-process container; `.dockerignore` whitelist approach;
  port bound to 127.0.0.1; uv/lockfile-pinned builds.
- **Tests**: meaningful boundaries (auth, ownership isolation, stale writes, storage
  rollback, AI candidate validation, oversized payloads, chat/manual serialization),
  no provider mocks by explicit decision, live checks isolated and opt-in.
- **Hygiene**: 81 tracked files with no build/test artifacts; no `console.log`,
  TODO/FIXME, emojis, `any`, or ts-ignore anywhere in source or docs.

---

## Consolidated actions

1. Fix `e2e/restart.spec.ts` (post-restart session expectation and announcement
   text) and re-run the explicit restart check. — H-1
2. Reconcile the payload size caps with the approved no-caps contract and record the
   decision in DATABASE.md and PLAN.md. — H-2
3. Update PLAN.md:33, DATABASE.md:60, and backend/AGENTS.md to the SQLite-backed
   session semantics (or revert the code — pick one truth). — M-1
4. Make `FORMA_USERNAME`/`FORMA_PASSWORD` work end to end (seed the configured
   username) or remove the override from code and docs. — M-2
5. Prune/cap the login-attempt map; consider a periodic expired-session sweep. — Low 1-2
6. Create the replacement session before deleting the old one at login. — Low 3
7. Map OpenRouter string error codes; make the storage-error detail agnostic. — Low 4-5
8. Untrack `.claude/settings.local.json`; resolve the uncommitted
   deletion/modification in the working tree. — Low 6
9. Align `@types/node` major; refresh stale test counts in PLAN.md status, and
   backend/AGENTS.md after the next full run. — Low 7
10. Optional cleanups from the Nit list (Done-by-id, `/api/hello` removal, duplicated
    reload wording, CLAUDE.md build-stage wording, chat history cap). — Nit 1-5
