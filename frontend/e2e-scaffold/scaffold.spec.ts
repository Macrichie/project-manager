import { expect, test } from "@playwright/test";

test("exported board loads its assets without browser errors", async ({ page, request }) => {
  const login = await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  expect(login.status()).toBe(200);
  const errors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", req => errors.push(`${req.url()}: ${req.failure()?.errorText}`));
  page.on("response", response => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  await page.goto("/");
  await expect(page).toHaveTitle("Forma | Project board");
  await expect(page.getByRole("region")).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.locator(".board")).toHaveCSS("display", "grid");
  await expect(page.getByRole("article").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect((await request.get("/api/health")).status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(errors).toEqual([]);
});

test("public files and static 404s are served through FastAPI", async ({ request }) => {
  const asset = await request.get("/file.svg");
  expect(asset.status()).toBe(200);
  expect(asset.headers()["content-type"]).toContain("image/svg+xml");
  expect((await request.get("/missing-page")).status()).toBe(404);
  expect((await request.get("/_next/static/missing.js")).status()).toBe(404);
});

test("unknown API routes remain JSON errors", async ({ request }) => {
  for (const path of ["/api", "/api/", "/api/missing", "/api/missing/nested"]) {
    for (const method of ["GET", "POST"]) {
      const response = await request.fetch(path, { method });
      expect(response.status()).toBe(404);
      expect(response.headers()["content-type"]).toBe("application/json");
      expect(await response.json()).toEqual({ detail: "Not Found" });
    }
  }
});

test("both health URLs return the same healthy response", async ({ request }) => {
  for (const path of ["/api/health", "/health", "/api/health/", "/health/"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  }
});

test("both hello URLs return the greeting", async ({ request }) => {
  for (const path of ["/api/hello", "/hello", "/api/hello/", "/hello/"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello, world!" });
  }
});

test("API documentation remains available alongside the frontend", async ({ request }) => {
  expect((await request.get("/docs")).status()).toBe(200);
  const schema = await (await request.get("/openapi.json")).json();
  expect(schema.paths).toHaveProperty("/api/health");
  expect(schema.paths).toHaveProperty("/api/hello");
});
