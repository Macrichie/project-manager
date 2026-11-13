import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function openBoard(page: Page) {
  await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  await page.goto("/");
  await expect(page.getByRole("region")).toHaveCount(5);
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await expect(page.getByLabel("Message your assistant")).toBeFocused();
}

async function send(page: Page, message: string) {
  const before = await (await page.request.get("/api/board")).json();
  await page.getByLabel("Message your assistant").fill(message);
  const response = page.waitForResponse(response => response.url().endsWith("/api/chat") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  let result = await response;
  // A real model can violate application invariants. Verify the refusal and then
  // explicitly submit again as a user would; the application never auto-retries.
  if (result.status() === 502 && (await result.json()).detail === "AI returned invalid board data. No changes were saved") {
    await expect(page.getByRole("complementary", { name: "AI assistant" }).getByRole("alert")).toContainText("No changes were saved");
    await expect(page.getByLabel("Message your assistant")).toHaveValue(message);
    expect(await (await page.request.get("/api/board")).json()).toEqual(before);
    const retry = page.waitForResponse(response => response.url().endsWith("/api/chat") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    result = await retry;
  }
  expect(result.status(), JSON.stringify(await result.json())).toBe(200);
  const saved = await result.json();
  await expect(page.getByLabel("Message your assistant")).toBeEnabled();
  await expect(page.getByLabel("Message your assistant")).toHaveValue("");
  return { saved, request: result.request().postDataJSON() };
}

test("live conversation updates the board and clears only session chat", async ({ page, context }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_LIVE_AI !== "1", "Explicit live provider check; no model replies are mocked.");
  test.setTimeout(180000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await openBoard(page);
  const first = await send(page, "Move 'A warmer welcome' to the FIRST position in Done. Create a card titled 'Sidebar first task' in To do with details 'First line\\nSecond line' (use a real newline). Rename Ideas to 'Ideas live'. Make no other changes.");
  expect(first.request.history).toEqual([]); expect(first.saved.updated).toBe(true);
  const createdId = first.saved.board.columns[1].cards.find((card: { title: string }) => card.title === "Sidebar first task").id;
  await expect(page.getByRole("button", { name: "Rename Ideas live", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(11);
  await expect(page.getByText("3 of 11 complete", { exact: true })).toBeVisible();
  const second = await send(page, "Move the existing card titled 'Sidebar first task' from To do to the FIRST position in Done, and change its title to 'Sidebar finished task'. Retain its existing ID and details. Make no other changes.");
  expect(second.request.history).toHaveLength(2);
  expect(second.request.history[0].role).toBe("user"); expect(second.request.history[1].role).toBe("assistant");
  expect(second.saved.board.columns[4].cards[0].id).toBe(createdId);
  expect(second.saved.board.columns[1].cards.some((card: { id: string }) => card.id === createdId)).toBe(false);
  const done = page.getByRole("region", { name: "Done", exact: true });
  const order = ["Sidebar finished task", "A warmer welcome", "Start with a clear purpose", "Lay the foundation"];
  await expect(done.getByRole("heading", { level: 3 })).toHaveText(order);
  await expect(page.getByText("4 of 11 complete", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/board")).status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/chat-${testInfo.project.name}.png`, fullPage: true });

  const separate = await context.newPage(); await separate.goto("/");
  await separate.getByRole("button", { name: "AI assistant", exact: true }).click();
  await expect(separate.getByRole("log")).toContainText("Make your next move.");
  await expect(separate.getByRole("log").locator(".chat-message")).toHaveCount(0);
  await separate.close();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(done.getByRole("heading", { level: 3 })).toHaveText(order);
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await expect(page.getByRole("log").locator(".chat-message")).toHaveCount(0);
  const reply = await send(page, "What is 2+2? Reply with just the number. Do not change the board.");
  expect(reply.request.history).toEqual([]); expect(reply.saved.updated).toBe(false);
  expect(reply.saved.revision).toBe(second.saved.revision); expect(reply.saved.reply.trim()).toBe("4");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("user"); await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(done.getByRole("heading", { level: 3 })).toHaveText(order);
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await expect(page.getByRole("log").locator(".chat-message")).toHaveCount(0);
  await page.getByLabel("Message your assistant").press("Escape");
  await expect(page.getByRole("button", { name: "AI assistant", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("live chat and manual saves share a lock and stale results show an error", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_LIVE_AI !== "1", "Explicit live provider check.");
  test.setTimeout(90000);
  await openBoard(page);
  const question = "Rename only card c1's title to 'Stale assistant title'. Return the complete changed board.";
  await page.getByLabel("Message your assistant").fill(question);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/board", async route => { if (route.request().method() === "PUT") await gate; await route.continue(); });
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Manual before chat");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  release(); await expect(page.getByRole("button", { name: "Rename Manual before chat", exact: true })).toBeVisible();
  await page.unroute("**/api/board");
  let finished = false;
  const response = page.waitForResponse(response => response.url().endsWith("/api/chat") && response.request().method() === "POST").then(response => { finished = true; return response; });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete A warmer welcome", exact: true })).toBeDisabled();
  let writes = 0;
  while (!finished) {
    const manual = await (await page.request.get("/api/board")).json();
    manual.board.columns[0].name = `Manual edit ${++writes}`;
    expect((await page.request.put("/api/board", { data: manual })).status()).toBe(200);
    await page.waitForTimeout(50);
  }
  expect((await response).status()).toBe(409);
  await expect(page.getByRole("complementary", { name: "AI assistant" }).getByRole("alert")).toContainText("Board changed");
  await expect(page.getByLabel("Message your assistant")).toHaveValue(question);
  await expect(page.getByRole("log").locator(".chat-message.assistant")).toHaveCount(0);
  const saved = await (await page.request.get("/api/board")).json();
  expect(saved.board.columns[0].cards[0].title).toBe("A warmer welcome");
  expect(saved.board.columns[0].name).toMatch(/^Manual edit /);
});

test("a blocked network request keeps the draft and permits manual work after recovery", async ({ page }) => {
  await openBoard(page);
  await page.route("**/api/chat", route => route.abort("internetdisconnected"));
  await page.getByLabel("Message your assistant").fill("Keep this unsent draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "AI assistant" }).getByRole("alert")).toContainText("Couldn't confirm");
  await expect(page.getByLabel("Message your assistant")).toHaveValue("Keep this unsent draft");
  await page.getByRole("button", { name: "Close assistant", exact: true }).click();
  await page.getByRole("button", { name: "Delete A warmer welcome", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(9);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(9);
});

test("missing AI configuration shows a useful error while manual cards still save", async ({ page }) => {
  const base = process.env.PLAYWRIGHT_NO_AI_URL;
  test.skip(!base, "Needs an isolated instance without an API key.");
  await page.request.post(base + "/api/auth/login", { data: { username: "user", password: "password" } });
  const original = await (await page.request.get(base + "/api/board")).json();
  try {
    await page.goto(base!);
    await page.getByRole("button", { name: "AI assistant", exact: true }).click();
    await page.getByLabel("Message your assistant").fill("What should I do next?");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "AI assistant" }).getByRole("alert")).toContainText("AI is not configured");
    await page.getByRole("button", { name: "Close assistant", exact: true }).click();
    await page.getByRole("button", { name: "New card in Ideas", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Manual work without AI");
    await page.getByRole("button", { name: "Add card", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Manual work without AI", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Manual work without AI", exact: true })).toBeVisible();
  } finally {
    const current = await (await page.request.get(base + "/api/board")).json();
    expect((await page.request.put(base + "/api/board", { data: { revision: current.revision, board: original.board } })).status()).toBe(200);
  }
});
