# Database design

Status: approved by the user's instruction to proceed to Part 6 on 2026-11-13. Part 6 implements storage and board routes; Part 7 connects the frontend to them.

## Storage

Use Python's existing `sqlite3` and `json` standard-library modules. Store each board as one JSON text value; validate its structure with the existing Pydantic dependency. Two tables are sufficient:

| Table | Columns | Purpose |
| --- | --- | --- |
| `users` | `id`, unique `username` | Stable identity for ownership; supports future users. |
| `boards` | `user_id` primary key/foreign key, `board_json`, `revision` | At most one board per user; complete board JSON and a counter for stale-write protection. |

Approved schema:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE IF NOT EXISTS boards (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    board_json TEXT NOT NULL CHECK (json_valid(board_json)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
) STRICT;
```

SQLite enforces ownership references, one board row per user, valid JSON, column types, and positive revisions. Application validation enforces the board's contents. Enable foreign keys on every connection, before beginning transactions; this setting is connection-specific. [SQLite table constraints](https://www.sqlite.org/lang_createtable.html), [foreign keys](https://www.sqlite.org/foreignkeys.html), [JSON functions](https://www.sqlite.org/json1.html).

No card/column tables, password column, board titles, timestamps, revision-history tables, or migration framework are needed for this MVP. The hardcoded credential check stays on the server. Real credential storage and account management require later design work.

## Board JSON and validation

[board.example.json](board.example.json) contains the exact current five-column, ten-card seed, including every title and detail from `frontend/app/board.ts`.

The stored value is an object containing only `columns`. Each column has only `id`, `name`, and `cards`; each card has only `id`, `title`, and `details`.

- Require exactly five columns, in this fixed ID order: `ideas`, `todo`, `progress`, `review`, `done`. Column names can change; column identities and their order cannot.
- Require string IDs, names, titles, and details. Names/titles must contain a non-whitespace character. Details may be an empty string and must preserve Unicode, punctuation, and newlines.
- Require nonblank card IDs that are unique across the entire board. Existing seed IDs such as `c1` remain valid; new cards use the frontend's UUID generation. Do not require UUID format for existing cards.
- Retain a card's ID when editing or moving it. A move changes its containing array and position; an edit changes its title/details. Deletion removes the card; adding creates a fresh ID. The server validates uniqueness and shape; a complete replacement can also express a deletion followed by an addition.
- Array order is the display order. Preserve all card objects and text except the changes explicitly submitted. The server does not silently trim valid text; frontend forms may continue their current trimming of titles/names.
- Empty columns and a board with all five `cards: []` arrays are valid. Duplicate column names and card titles are allowed; identity comes from IDs.
- Reject unknown fields, extra/missing columns, duplicate card IDs, wrong types, and blank names/titles. Add no arbitrary title/detail length limit; the existing long-title behavior must continue to work.
- Ownership, revision, session tokens, and chat messages are not part of the board JSON. Card IDs need be unique only within their owning board.

## Creation, seeding, and persistence

- Use `DATABASE_PATH`, already configured as `/data/kanban.db` in Compose. The existing `forma_board-data` named volume mounts `/data`. A direct local backend run may default to `backend/data/kanban.db`, resolved from the project location rather than the shell's working directory.
- On startup, create the parent directory, open/create the SQLite file, and create the tables if absent. Initialize the MVP user and its board in one transaction.
- Insert username `user` only if that username is absent, then read its database ID. Insert its seed board at revision 1 only if no board row exists, using `ON CONFLICT(user_id) DO NOTHING`. Never decide to seed based on card count, column names, or comparison with dummy data.
- Package the approved seed JSON under `backend/app/` during Part 6, keeping it identical to the approved example. The deployed backend must not read documentation files or TypeScript source at runtime.
- Existing board rows are never replaced at startup. An intentionally empty board remains empty. Ordinary reads/writes do not recreate missing rows; return 404 for a missing owned board so an inconsistent database is visible.
- Refresh, logout/login, container replacement, and normal stop/start preserve the board. Logout never deletes or resets stored work. Part 7 connects frontend operations to this storage.
- The current auth code uses placeholder user ID 1. During Part 6, resolve the hardcoded username against `users` when issuing a session; do not assume its database ID. Continue accepting only `user` / `password` and return the same public user shape.
- Future user provisioning must create a user row and its single board together using the same initialization approach. Tests may create a second user/session to prove isolation. No registration, user-management endpoint, or additional login credentials are added now.
- Keep authentication sessions in memory. Restarting the server requires signing in again, while the board remains saved. Chat history stays only in the current page's memory and is never written to SQLite, session records, or browser storage.

## Minimal board API

Both routes require `Annotated[Session, Depends(require_session)]`. Obtain the owner exclusively from `session.user.id`; there is no user ID or board selector in the URL/body. Put routes before the existing API fallback/static mount, retain the cross-site write checks, and use `Cache-Control: no-store` for private responses.

| Route | Request | Success |
| --- | --- | --- |
| `GET /api/board` | Session cookie | 200 with `{ "revision": integer, "board": object }`. |
| `PUT /api/board` | Same envelope: expected positive integer `revision` and complete validated `board` | 200 with the saved board and incremented revision. |

These two routes cover adding, editing, deleting, renaming, moving, and reordering through replacement of the small board document. No separate per-card routes are needed.

Example response for a saved board after removing every card and renaming the first column:

```json
{
  "revision": 7,
  "board": {
    "columns": [
      { "id": "ideas", "name": "Backlog", "cards": [] },
      { "id": "todo", "name": "To do", "cards": [] },
      { "id": "progress", "name": "In progress", "cards": [] },
      { "id": "review", "name": "In review", "cards": [] },
      { "id": "done", "name": "Done", "cards": [] }
    ]
  }
}
```

Sending that envelope to PUT while revision 7 is current saves the empty board and returns revision 8. Every accepted PUT increments the revision once, including an identical replacement. The frontend uses the returned board/revision rather than guessing the server's state.

| Status | Meaning |
| --- | --- |
| 401 | Missing, invalid, revoked, or expired session. |
| 403 | Cross-site write blocked by the existing browser-write policy. |
| 404 | No board for the authenticated owner. |
| 409 | Expected revision is stale; no changes saved. |
| 422 | Invalid JSON, envelope, revision, board structure, or fields. |
| 5xx | Storage failure; preserve the previous committed board and return a concise error. |

Use normal FastAPI validation errors for 422. A conflict returns `{"detail":"Board changed. Reload it before saving again."}`. The client refetches the authoritative board, retains text inputs where appropriate, and asks the user to repeat the change. Do not silently resubmit the entire stale board with a newer revision.

## Atomic writes and AI compatibility

Validate before writing and use parameter binding. Update the document and counter together in one short transaction:

```sql
UPDATE boards
SET board_json = ?, revision = revision + 1
WHERE user_id = ? AND revision = ?;
```

One affected row means success; commit and return that saved document with the incremented revision. Zero affected rows means no write: distinguish a missing owned row (404) from a revision mismatch (409). Roll back on database errors. No other user's row can match the owner predicate.

For example, two tabs load revision 3. The first write succeeds at revision 4; the second write expecting 3 affects zero rows and returns 409. The first write is preserved. Serialize saves within one page to avoid unnecessary local conflicts; the revision check also protects against other tabs and AI requests.

In Part 9, load the authoritative board and revision before calling the AI. Release the connection/transaction while awaiting the network. Validate an optional updated board through the same model and perform the same conditional update against that original revision. If work changed meanwhile, reject the AI update with 409, refetch, and do not present an uncommitted change as successful. Persist a valid update before returning the saved board/revision with the assistant reply. Reply-only output does not write or increment a revision. The chat request/response contract itself belongs to Part 9.

Use short-lived SQLite connections and explicit commit/rollback/close handling. The default journal mode is sufficient for this single-container MVP; no connection pool, background writer, WAL requirement, merge engine, or real-time synchronization is proposed. Existing incompatible/corrupt data must surface an error rather than being deleted or silently reseeded. [Python sqlite3](https://docs.python.org/3.14/library/sqlite3.html).

## Focused acceptance checks for implementation

- Fresh database creation, repeat startup, and seed-once behavior; exact JSON round-trip of the current seed, Unicode/newline details, renamed columns, reordered cards, and empty boards.
- Authenticated owner isolation with two test users; invalid sessions and invalid/extra fields cannot change stored data.
- Atomic writes and revision conflicts: exactly one of two saves from the same revision succeeds; an AI candidate based on an old revision cannot overwrite a manual save.
- Failed validation/storage leaves the last committed board intact. Reopening the database and restarting the container retain saved and intentionally empty boards.

Follow the plan's practical approximately 80% coverage policy where measurement is useful. These checks target the invariants rather than a large test matrix or an arbitrary percentage.

## Approval

The user approved the two-table schema, whole-board JSON format, seed-once lifecycle, and revision-based GET/PUT contract by instructing us to proceed to Part 6 on 2026-11-13. Part 5 itself made documentation changes only.
