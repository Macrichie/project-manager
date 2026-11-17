import { expect, test } from "./fixtures";

test("change password flow for registered user", async ({ page }) => {
  // Register a new user
  await page.goto("/");
  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Username").fill("pwtest");
  await page.getByLabel("Password").fill("oldpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /Your boards/ })).toBeVisible();

  // Open password change dialog
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("dialog", { name: "Change password" })).toBeVisible();

  // Wrong current password
  await page.getByLabel("Current password").fill("wrongpass");
  await page.getByLabel("New password").fill("newpass123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");

  // Correct change
  await page.getByLabel("Current password").fill("oldpass123");
  await page.getByLabel("New password").fill("newpass456");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible();

  // Log out and log in with new password
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill("pwtest");
  await page.getByLabel("Password").fill("newpass456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Your boards/ })).toBeVisible();
});
