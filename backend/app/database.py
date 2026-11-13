import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path

from pydantic import ValidationError

from app.models import Board, BoardDocument

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "kanban.db"
SEED_PATH = Path(__file__).with_name("seed.json")
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE IF NOT EXISTS boards (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    board_json TEXT NOT NULL CHECK (json_valid(board_json)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
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
        self.ensure_user_board("user")

    def ensure_user_board(self, username: str) -> dict:
        seed = Board.model_validate_json(SEED_PATH.read_text(encoding="utf-8"))
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING",
                (username,),
            )
            user = dict(connection.execute(
                "SELECT id, username FROM users WHERE username = ?", (username,)
            ).fetchone())
            connection.execute(
                "INSERT INTO boards (user_id, board_json) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO NOTHING",
                (user["id"], seed.model_dump_json()),
            )
        return user

    def get_user(self, username: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT id, username FROM users WHERE username = ?", (username,)
            ).fetchone()
        return dict(row) if row is not None else None

    def read_board(self, user_id: int) -> BoardDocument:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT board_json, revision FROM boards WHERE user_id = ?", (user_id,)
            ).fetchone()
        if row is None:
            raise BoardNotFound
        try:
            return BoardDocument(
                revision=row["revision"], board=Board.model_validate_json(row["board_json"])
            )
        except ValidationError as error:
            raise StoredBoardError from error

    def save_board(self, user_id: int, document: BoardDocument) -> BoardDocument:
        with self.connection() as connection:
            result = connection.execute(
                "UPDATE boards SET board_json = ?, revision = revision + 1 "
                "WHERE user_id = ? AND revision = ?",
                (document.board.model_dump_json(), user_id, document.revision),
            )
            if result.rowcount == 0:
                exists = connection.execute(
                    "SELECT 1 FROM boards WHERE user_id = ?", (user_id,)
                ).fetchone()
                if exists is None:
                    raise BoardNotFound
                raise BoardConflict
        return BoardDocument(revision=document.revision + 1, board=document.board)
