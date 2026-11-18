import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { username: "user", password: "password" } });
  expect(login.status()).toBe(200);
  await page.goto("/");
});

test("boards list shows default board and allows navigation to it", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Your boards/ })).toBeVisible();
  const boardCard = page.getByRole("heading", { name: "My Board" }).first();
  await expect(boardCard).toBeVisible();
  await boardCard.click();
  await expect(page.getByRole("region")).toHaveCount(5);
  // Back button returns to boards list
  await page.getByRole("button", { name: "Back to boards" }).click();
  await expect(page.getByRole("heading", { name: /Your boards/ })).toBeVisible();
});

test("create a new board and navigate to it", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Your boards/ })).toBeVisible();
  await page.getByRole("button", { name: "Create new board" }).click();
  await page.getByPlaceholder("e.g. Sprint 1").fill("Test Board");
  await page.getByRole("button", { name: /Create board/ }).click();
  await expect(page.getByRole("heading", { name: "Test Board" })).toBeVisible();
  // Navigate to the new board
  await page.getByRole("heading", { name: "Test Board" }).click();
  await expect(page.getByRole("region")).toHaveCount(5);
  // Clean up: go back and delete
  await page.getByRole("button", { name: "Back to boards" }).click();
  await page.getByRole("button", { name: "Delete Test Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test Board" })).toHaveCount(0);
});

test("rename a board from the boards list", async ({ page }) => {
  // Create a board to rename
  await page.getByRole("button", { name: "Create new board" }).click();
  await page.getByPlaceholder("e.g. Sprint 1").fill("Rename Me");
  await page.getByRole("button", { name: /Create board/ }).click();
  await expect(page.getByRole("heading", { name: "Rename Me" })).toBeVisible();
  // Rename it
  await page.getByRole("button", { name: "Rename Rename Me", exact: true }).click();
  const renameInput = page.locator(".board-rename-form input[name='name']");
  await renameInput.fill("Renamed Board");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Renamed Board" })).toBeVisible();
  // Clean up
  await page.getByRole("button", { name: "Delete Renamed Board", exact: true }).click();
});
