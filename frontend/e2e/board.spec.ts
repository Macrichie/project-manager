import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const ideaTitles = ["A warmer welcome", "Small details, big difference", "Give empty states a voice"];

async function dragCard(page: Page, title: string, targetTitle: string, cancel = false) {
  await expect(page.locator(".overlay")).toHaveCount(0);
  const handle = page.getByRole("button", { name: `Move ${title}`, exact: true });
  await handle.hover();
  const target = page.getByRole("article").filter({ has: page.getByRole("heading", { name: targetTitle, exact: true }) });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8);
  await expect(page.locator(".dragging")).toHaveCount(1);
  await page.mouse.move(to.x + to.width - 50, to.y + to.height / 2, { steps: 20 });
  await expect(page.locator(".column.drop-target")).toHaveCount(1);
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

async function keyboardMove(page: Page, title: string, key: string, targetId: string, cancel = false) {
  await expect(page.locator(".overlay")).toHaveCount(0);
  const handle = page.getByRole("button", { name: `Move ${title}`, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(key);
  await expect(page.getByRole("status")).toContainText(/over /i);
  await page.keyboard.press(cancel ? "Escape" : "Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
}
test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  expect(login.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("region")).toHaveCount(5);
});
test("full workflow persists edits, rename, deletion, and exact order after refresh and login", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("region")).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: "New card in To do" }).click();
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByLabel("Title")).toBeVisible();
  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByLabel("Title").fill("A".repeat(180));
  await page.getByRole("textbox", { name: "Details (optional)", exact: true }).fill("First line\nSecond line");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: `Edit ${"A".repeat(180)}`, exact: true }).click();
  await page.getByLabel("Title").fill("Edited card");
  await page.getByRole("textbox", { name: "Details (optional)", exact: true }).fill("Café\nSecond line  ");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename To do", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Next up");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Next up" })).toBeVisible();
  await page.getByRole("button", { name: "Delete A warmer welcome", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: "New card in Next up" }).click();
  await page.getByLabel("Title").fill("Discard this");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Discard this")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Rename Next up", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "A warmer welcome", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Next up", exact: true }).getByRole("heading", { level: 3 })).toHaveText(["Map the core journey", "Find our visual rhythm", "Edited card"]);
  await expect(page.getByText("Café\nSecond line", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username").fill("user"); await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("region", { name: "Next up", exact: true }).getByRole("heading", { level: 3 })).toHaveText(["Map the core journey", "Find our visual rhythm", "Edited card"]);
  expect(errors).toEqual([]);
});
test("pointer dragging into an empty column and canceled dragging", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Pointer scenario uses desktop mouse; mobile touch tested separately.");
  await page.getByRole("button", { name: "Delete A second pair of eyes" }).click();
  const target = page.getByRole("region", { name: "In review", exact: true });
  await expect(target.getByText("Room for your next idea.")).toBeVisible();
  const handle = page.getByRole("button", { name: "Move A warmer welcome", exact: true });
  const from = (await handle.boundingBox())!; const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + 100, { steps: 20 }); await page.mouse.up();
  await expect(target.getByRole("heading", { name: "A warmer welcome" })).toBeVisible();
  const next = (await page.getByRole("button", { name: "Move Small details, big difference", exact: true }).boundingBox())!;
  await page.mouse.move(next.x + 5, next.y + 5); await page.mouse.down(); await page.mouse.move(to.x + 80, to.y + 150, { steps: 15 }); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.getByRole("region", { name: "Ideas", exact: true }).getByRole("heading", { name: "Small details, big difference" })).toBeVisible();
});
test("keyboard movement and cancel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard scenario.");
  await keyboardMove(page, ideaTitles[0], "ArrowRight", "c4");
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("heading", { name: "A warmer welcome" })).toBeVisible();
  await keyboardMove(page, ideaTitles[1], "ArrowRight", "c1", true);
  await expect(page.getByRole("region", { name: "Ideas", exact: true }).getByRole("heading", { name: "Small details, big difference" })).toBeVisible();
});
test("layout and visual capture", async ({ page }, testInfo) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "New card in Done", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "New card in Done", exact: true })).toBeVisible();
  await page.locator(".board-scroll").evaluate(element => element.scrollLeft = 0);
  await page.screenshot({ path: `test-results/board-${testInfo.project.name}.png`, fullPage: true });
});

test("a stale tab reloads saved work and keeps the edit draft for review", async ({ page, context }) => {
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Edit A warmer welcome", exact: true }).click();
  await second.getByLabel("Title").fill("Draft from another tab");
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Saved in first tab");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Rename Saved in first tab", exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(second.locator("main").getByRole("alert")).toContainText("changed elsewhere");
  await expect(second.getByRole("button", { name: "Rename Saved in first tab", exact: true })).toBeVisible();
  await expect(second.getByLabel("Title")).toHaveValue("Draft from another tab");
  await second.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Draft from another tab", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Draft from another tab", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename Saved in first tab", exact: true })).toBeVisible();
  await second.close();
});

test("loads an empty saved board and updates completion when adding to Done", async ({ page }) => {
  const saved = await (await page.request.get("/api/board")).json();
  for (const column of saved.board.columns) column.cards = [];
  expect((await page.request.put("/api/board", { data: saved })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("region")).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("0 of 0 complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New card in Done", exact: true }).click();
  await page.getByLabel("Title").fill("First finished task");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByText("1 of 1 complete", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "First finished task", exact: true })).toBeVisible();
});
test("touch dragging between columns", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch scenario uses the mobile viewport.");
  // Keep both columns visible without holding the finger in the auto-scroll zone.
  await page.locator(".board-scroll").evaluate(element => element.scrollLeft = 110);
  const handle = page.getByRole("button", { name: "Move A warmer welcome", exact: true });
  const from = (await handle.boundingBox())!;
  const target = page.getByRole("region", { name: "To do", exact: true });
  const to = (await target.boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = from.x + from.width / 2; const y = from.y + from.height / 2;
  const endX = Math.min(to.x + 60, 370);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 15; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (endX - x) * i / 15, y: y + 25 * i / 15 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(target.getByRole("heading", { name: "A warmer welcome" })).toBeVisible();
});

test("pointer reorders cards up and down, inserts between columns, and cancels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Pointer scenario uses desktop mouse.");
  const ideas = page.getByRole("region", { name: "Ideas", exact: true });
  await dragCard(page, ideaTitles[0], ideaTitles[1]);
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[0], ideaTitles[2]]);
  await dragCard(page, ideaTitles[0], ideaTitles[2]);
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[2], ideaTitles[0]]);
  await dragCard(page, ideaTitles[0], ideaTitles[1]);
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText(ideaTitles);
  await dragCard(page, ideaTitles[0], ideaTitles[2], true);
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText(ideaTitles);
  await dragCard(page, ideaTitles[0], "Find our visual rhythm");
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("heading", { level: 3 })).toHaveText(["Map the core journey", ideaTitles[0], "Find our visual rhythm"]);
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.reload();
  await expect(page.getByRole("region", { name: "To do", exact: true }).getByRole("heading", { level: 3 })).toHaveText(["Map the core journey", ideaTitles[0], "Find our visual rhythm"]);
});

test("keyboard reorders one card per arrow key and restores focus, with cancel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard scenario.");
  const ideas = page.getByRole("region", { name: "Ideas", exact: true });
  const handle = page.getByRole("button", { name: `Move ${ideaTitles[0]}`, exact: true });
  await keyboardMove(page, ideaTitles[0], "ArrowDown", "c2");
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[0], ideaTitles[2]]);
  await expect(handle).toBeFocused();
  await keyboardMove(page, ideaTitles[0], "ArrowDown", "c3");
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[2], ideaTitles[0]]);
  await keyboardMove(page, ideaTitles[0], "ArrowUp", "c3");
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[0], ideaTitles[2]]);
  await keyboardMove(page, ideaTitles[0], "ArrowUp", "c2", true);
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[0], ideaTitles[2]]);
  await expect(handle).toBeFocused();
  await page.reload();
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText([ideaTitles[1], ideaTitles[0], ideaTitles[2]]);
});

test("touch reorders cards within a column", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch scenario uses the mobile viewport.");
  // Center both cards outside the viewport's vertical auto-scroll zones.
  await page.evaluate(() => window.scrollTo(0, 200));
  const ideas = page.getByRole("region", { name: "Ideas", exact: true });
  const client = await context.newCDPSession(page);
  for (const expectedOrder of [[ideaTitles[1], ideaTitles[0], ideaTitles[2]], ideaTitles]) {
    await expect(page.locator(".overlay")).toHaveCount(0);
    const from = (await page.getByRole("button", { name: `Move ${ideaTitles[0]}`, exact: true }).boundingBox())!;
    const to = (await ideas.getByRole("article").filter({ has: page.getByRole("heading", { name: ideaTitles[1], exact: true }) }).boundingBox())!;
    const x = from.x + from.width / 2; const y = from.y + from.height / 2;
    const endY = to.y + 24;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 20; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (endY - y) * i / 20 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(ideas.getByRole("heading", { level: 3 })).toHaveText(expectedOrder);
  }
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText(ideaTitles);
  await page.reload();
  await expect(ideas.getByRole("heading", { level: 3 })).toHaveText(ideaTitles);
});
