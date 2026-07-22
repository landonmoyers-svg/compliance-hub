import { test, expect } from "@playwright/test";
import { login } from "./lib/login";

/**
 * Authenticated smoke — signs in once, then walks the key pages asserting each
 * renders a heading and doesn't hit an error boundary. This is the suite that
 * would have caught the "page is failing" regressions before they shipped.
 * Runs only when E2E credentials are provided.
 */
const ROUTES = [
  "/",
  "/executive-dashboard",
  "/credentials",
  "/insurance-vault",
  "/continuing-education",
  "/employee-lifecycle",
  "/business-records",
  "/training",
  "/competency-tracker",
  "/vendor-management",
  "/payer-enrollment",
  "/hr/employees",
  "/employee-vault",
  "/reports",
  "/audit-trail",
  "/settings",
];

const ERROR_BOUNDARY = /Something went wrong on this page|The app hit an unexpected error/;

test.describe("authenticated page smoke", () => {
  test.skip(!process.env.E2E_EMAIL, "Set E2E_EMAIL / E2E_PASSWORD / E2E_TOTP_SECRET to run the authenticated smoke.");

  test("key pages render without error", async ({ page }) => {
    await login(page);
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByText(ERROR_BOUNDARY), `error boundary on ${route}`).toHaveCount(0);
      await expect(page.locator("h1, h2").first(), `no heading on ${route}`).toBeVisible();
    }
  });
});
