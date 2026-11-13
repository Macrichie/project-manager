import { execFileSync } from "node:child_process";
import { test, expect } from "./fixtures";

test("browser changes survive container restart", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || !process.env.PLAYWRIGHT_RESTART_CONTAINER,
    "Run explicitly against an isolated container with PLAYWRIGHT_RESTART_CONTAINER set to its name.");
  await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  await page.goto("/");
  await page.getByRole("button", { name: "Edit A warmer welcome", exact: true }).click();
  await page.getByLabel("Title").fill("Restart saved title");
  await page.getByRole("textbox", { name: "Details (optional)", exact: true }).fill("Multiline details\nPreserved across restart");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Restart saved title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Restart backlog");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Rename Restart backlog", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Give empty states a voice", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(9);
  const handle = page.getByRole("button", { name: "Move Restart saved title", exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("status")).toContainText("over droppable area c2");
  await page.keyboard.press("Space");
  const backlog = page.getByRole("region", { name: "Restart backlog", exact: true });
  await expect(backlog.getByRole("heading", { level: 3 })).toHaveText(["Small details, big difference", "Restart saved title"]);
  const saved = await (await page.request.get("/api/board")).json();

  execFileSync("docker", ["restart", process.env.PLAYWRIGHT_RESTART_CONTAINER!]);
  await expect.poll(async () => {
    try { return (await page.request.get("/api/health")).status(); } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  await page.reload();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("user");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(backlog.getByRole("heading", { level: 3 })).toHaveText(["Small details, big difference", "Restart saved title"]);
  await expect(page.getByText("Multiline details\nPreserved across restart", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Give empty states a voice", exact: true })).toHaveCount(0);
  expect(await (await page.request.get("/api/board")).json()).toEqual(saved);
});
