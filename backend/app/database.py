import json
import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path
from time import time as now

from pydantic import ValidationError

from app.models import Board, BoardDocument

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "kanban.db"
SEED_PATH = Path(__file__).with_name("seed.json")
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member'
) STRICT;
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name TEXT NOT NULL DEFAULT 'My Board',
    description TEXT NOT NULL DEFAULT '',
    board_json TEXT NOT NULL CHECK (json_valid(board_json)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at REAL NOT NULL
) STRICT;
"""


class BoardNotFound(Exception):
    pass


class BoardConflict(Exception):
    pass


class StoredBoardError(Exception):
    pass


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connection(self):
        with closing(sqlite3.connect(self.path)) as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            with connection:
                yield connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.executescript(SCHEMA)
        self._ensure_default_user()

    def _ensure_default_user(self) -> None:
        """Ensure the default env-var user exists with a board."""
        seed = Board.model_validate_json(SEED_PATH.read_text(encoding="utf-8"))
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING",
                ("user",),
            )
            user = dict(connection.execute(
                "SELECT id, username FROM users WHERE username = ?", ("user",)
            ).fetchone())
            existing = connection.execute(
                "SELECT 1 FROM boards WHERE user_id = ?", (user["id"],)
            ).fetchone()
            if existing is None:
                ts = now()
                connection.execute(
                    "INSERT INTO boards (user_id, name, board_json, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user["id"], "My Board", seed.model_dump_json(), ts, ts),
                )

    def ensure_user_board(self, username: str) -> dict:
        """Ensure a user exists and has at least one board. Used by registration."""
        seed = Board.model_validate_json(SEED_PATH.read_text(encoding="utf-8"))
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING",
                (username,),
            )
            user = dict(connection.execute(
                "SELECT id, username FROM users WHERE username = ?", (username,)
            ).fetchone())
            existing = connection.execute(
                "SELECT 1 FROM boards WHERE user_id = ?", (user["id"],)
            ).fetchone()
            if existing is None:
                ts = now()
                connection.execute(
                    "INSERT INTO boards (user_id, name, board_json, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user["id"], "My Board", seed.model_dump_json(), ts, ts),
                )
        return user

    def get_user(self, username: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        return dict(row) if row is not None else None

    def update_password(self, user_id: int, password_hash: str) -> None:
        with self.connection() as connection:
            connection.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (password_hash, user_id),
            )

    def register_user(self, username: str, password_hash: str, display_name: str = "") -> dict:
        with self.connection() as connection:
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
                (username, password_hash, display_name),
            )
            user_id = cursor.lastrowid
        return {"id": user_id, "username": username, "display_name": display_name}

    # --- Multi-board operations ---

    def create_board(self, user_id: int, name: str, description: str = "") -> dict:
        seed = Board.model_validate_json(SEED_PATH.read_text(encoding="utf-8"))
        ts = now()
        with self.connection() as connection:
            cursor = connection.execute(
                "INSERT INTO boards (user_id, name, description, board_json, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, name, description, seed.model_dump_json(), ts, ts),
            )
            return {
                "id": cursor.lastrowid, "name": name, "description": description,
                "created_at": ts, "updated_at": ts,
            }

    def list_boards(self, user_id: int) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, name, description, board_json, updated_at FROM boards "
                "WHERE user_id = ? ORDER BY created_at ASC",
                (user_id,),
            ).fetchall()
        result = []
        for row in rows:
            board_data = json.loads(row["board_json"])
            card_count = sum(len(col.get("cards", [])) for col in board_data.get("columns", []))
            result.append({
                "id": row["id"], "name": row["name"], "description": row["description"],
                "card_count": card_count, "updated_at": row["updated_at"],
            })
        return result

    def get_first_board_id(self, user_id: int) -> int | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT id FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                (user_id,),
            ).fetchone()
        return row["id"] if row else None

    def read_board(self, user_id: int, board_id: int | None = None) -> BoardDocument:
        with self.connection() as connection:
            if board_id is None:
                # Legacy: read first board for user
                row = connection.execute(
                    "SELECT board_json, revision FROM boards WHERE user_id = ? "
                    "ORDER BY created_at ASC LIMIT 1",
                    (user_id,),
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT board_json, revision FROM boards WHERE id = ? AND user_id = ?",
                    (board_id, user_id),
                ).fetchone()
        if row is None:
            raise BoardNotFound
        try:
            return BoardDocument(
                revision=row["revision"], board=Board.model_validate_json(row["board_json"])
            )
        except ValidationError as error:
            raise StoredBoardError from error

    def save_board(self, user_id: int, document: BoardDocument, board_id: int | None = None) -> BoardDocument:
        with self.connection() as connection:
            if board_id is None:
                # Legacy: save first board for user
                first = connection.execute(
                    "SELECT id FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                    (user_id,),
                ).fetchone()
                if first is None:
                    raise BoardNotFound
                board_id = first["id"]

            ts = now()
            result = connection.execute(
                "UPDATE boards SET board_json = ?, revision = revision + 1, updated_at = ? "
                "WHERE id = ? AND user_id = ? AND revision = ?",
                (document.board.model_dump_json(), ts, board_id, user_id, document.revision),
            )
            if result.rowcount == 0:
                exists = connection.execute(
                    "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
                ).fetchone()
                if exists is None:
                    raise BoardNotFound
                raise BoardConflict
        return BoardDocument(revision=document.revision + 1, board=document.board)

    def update_board_meta(self, user_id: int, board_id: int, name: str | None = None, description: str | None = None) -> dict:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT id, name, description, updated_at FROM boards WHERE id = ? AND user_id = ?",
                (board_id, user_id),
            ).fetchone()
            if row is None:
                raise BoardNotFound
            new_name = name if name is not None else row["name"]
            new_desc = description if description is not None else row["description"]
            ts = now()
            connection.execute(
                "UPDATE boards SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (new_name, new_desc, ts, board_id, user_id),
            )
            return {"id": board_id, "name": new_name, "description": new_desc, "updated_at": ts}

    def delete_board(self, user_id: int, board_id: int) -> None:
        with self.connection() as connection:
            # Check ownership first to avoid leaking board existence
            exists = connection.execute(
                "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
            ).fetchone()
            if exists is None:
                raise BoardNotFound
            count = connection.execute(
                "SELECT count(*) as cnt FROM boards WHERE user_id = ?", (user_id,)
            ).fetchone()["cnt"]
            if count <= 1:
                raise ValueError("Cannot delete the last board")
            connection.execute(
                "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
            )

    def board_count(self, user_id: int) -> int:
        with self.connection() as connection:
            return connection.execute(
                "SELECT count(*) FROM boards WHERE user_id = ?", (user_id,)
            ).fetchone()[0]

    # --- Session persistence ---

    def create_session(self, token: str, user_id: int, expires_at: float) -> None:
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token, user_id, expires_at),
            )

    def get_session(self, token: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT s.user_id, s.expires_at, u.id, u.username "
                "FROM sessions s JOIN users u ON s.user_id = u.id "
                "WHERE s.token = ?",
                (token,),
            ).fetchone()
        return dict(row) if row else None

    def delete_session(self, token: str) -> None:
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def cleanup_sessions(self, cutoff: float) -> None:
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (cutoff,))
