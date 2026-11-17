import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  expect(login.status()).toBe(200);
  await page.goto("/");
  // Navigate to first board
  const boardCard = page.getByText("My Board").first();
  await boardCard.click();
  await expect(page.getByRole("region")).toHaveCount(5);
});

test("add a card with priority, labels, and due date", async ({ page }) => {
  await page.getByRole("button", { name: "New card in Ideas" }).click();
  await page.getByLabel("Title").fill("Enhanced Card");
  await page.getByLabel("Details").fill("Card with metadata");
  await page.getByLabel(/Priority/).selectOption("high");
  await page.getByPlaceholder("e.g. bug, urgent").fill("feature, v2");
  await page.getByLabel(/Due date/).fill("2026-12-25");
  await page.getByRole("button", { name: "Add card" }).click();
  // Verify visual indicators
  await expect(page.getByText("high")).toBeVisible();
  await expect(page.getByText("feature")).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();
  await expect(page.getByText("2026-12-25")).toBeVisible();
  // Clean up
  await page.getByRole("button", { name: "Delete Enhanced Card" }).click();
});

test("filter cards by search text", async ({ page }) => {
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: "Filter cards" }).click();
  await page.getByLabel("Search cards").fill("warmer welcome");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "A warmer welcome" })).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
});

test("filter cards by priority", async ({ page }) => {
  // Add a high-priority card
  await page.getByRole("button", { name: "New card in Ideas" }).click();
  await page.getByLabel("Title").fill("Urgent Bug");
  await page.getByLabel(/Priority/).selectOption("high");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("heading", { name: "Urgent Bug" })).toBeVisible();
  // Filter by high priority
  await page.getByRole("button", { name: "Filter cards" }).click();
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await page.getByRole("heading", { name: "Urgent Bug" }).isVisible()).toBe(true);
  // Clean up
  await page.getByLabel("Filter by priority").selectOption("");
  await page.getByRole("button", { name: "Delete Urgent Bug" }).click();
});

test("overdue card shows overdue styling", async ({ page }) => {
  await page.getByRole("button", { name: "New card in To do" }).click();
  await page.getByLabel("Title").fill("Past Due Task");
  await page.getByLabel(/Due date/).fill("2024-01-01");
  await page.getByRole("button", { name: "Add card" }).click();
  const dueElement = page.locator(".card-due.overdue");
  await expect(dueElement).toBeVisible();
  // Clean up
  await page.getByRole("button", { name: "Delete Past Due Task" }).click();
});
