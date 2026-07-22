import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-test config. Runs against a deployed URL (or a locally-served build) set
 * via E2E_BASE_URL. Public tests need no credentials; the authenticated page
 * sweep runs only when E2E_EMAIL / E2E_PASSWORD (and E2E_TOTP_SECRET, since MFA
 * is enforced) are set. Install browsers once with `npx playwright install`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://compliance-hub-green.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
