import { test, expect } from "@playwright/test";

/**
 * Public smoke — no credentials needed. Catches total build/deploy breakage:
 * the login page must render and the auth guard must redirect anonymous users.
 */
test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("anonymous users are redirected to login", async ({ page }) => {
  await page.goto("/credentials");
  await expect(page).toHaveURL(/\/auth\/login/);
});
