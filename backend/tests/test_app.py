import pytest


@pytest.mark.parametrize("path", ["/api/health", "/health", "/api/health/", "/health/"])
def test_health_returns_json(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/api/hello", "/hello", "/api/hello/", "/hello/"])
def test_hello_returns_json(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"message": "Hello, world!"}


def test_root_serves_the_static_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Project board" in response.text


@pytest.mark.parametrize("path", ["/api", "/api/", "/api/missing", "/api/missing/nested"])
@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
def test_unknown_api_route_returns_json_not_html(client, path, method):
    response = client.request(method, path)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"


@pytest.mark.parametrize("path", ["/.env", "/data/kanban.db", "/app/main.py"])
def test_private_files_are_not_served(client, path):
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("path,content_type", [
    ("/_next/static/board.css", "text/css"),
    ("/_next/static/board.js", "javascript"),
    ("/file.svg", "image/svg+xml"),
])
def test_static_assets_are_served_with_their_content_type(client, path, content_type):
    response = client.get(path)
    assert response.status_code == 200
    assert content_type in response.headers["content-type"]


@pytest.mark.parametrize("path", ["/missing-page", "/_next/static/missing.js"])
def test_missing_static_resources_return_404(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert "Page not found" in response.text


def test_static_files_support_head_and_conditional_requests(client):
    response = client.get("/_next/static/board.css")
    assert client.head("/_next/static/board.css").status_code == 200
    assert client.get("/_next/static/board.css", headers={"If-None-Match": response.headers["etag"]}).status_code == 304
