import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    frontend_dir = tmp_path / "static"
    frontend_dir.mkdir()
    (frontend_dir / "index.html").write_text("<!doctype html><h1>Project board</h1>", encoding="utf-8")
    (frontend_dir / "404.html").write_text("<!doctype html><h1>Page not found</h1>", encoding="utf-8")
    assets = frontend_dir / "_next" / "static"
    assets.mkdir(parents=True)
    (assets / "board.css").write_text("body { color: #032147; }", encoding="utf-8")
    (assets / "board.js").write_text("console.log('board');", encoding="utf-8")
    (frontend_dir / "file.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
    with TestClient(create_app(frontend_dir, database_path=tmp_path / "data" / "kanban.db")) as client:
        yield client
