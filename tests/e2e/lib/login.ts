import { type Page, expect } from "@playwright/test";
import { totp } from "./totp";

/**
 * Sign in through the real login flow, including the MFA step (MFA is enforced
 * app-wide). Requires E2E_EMAIL, E2E_PASSWORD and — because of MFA — the enrolled
 * account's E2E_TOTP_SECRET (base32). The test account should already have a
 * verified authenticator factor.
 */
export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const secret = process.env.E2E_TOTP_SECRET;
  if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD must be set");

  await page.goto("/auth/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // MFA challenge (numeric code input) — fill it if it appears.
  const code = page.locator('input[inputmode="numeric"]').first();
  if (await code.isVisible({ timeout: 8000 }).catch(() => false)) {
    if (!secret) throw new Error("MFA was requested but E2E_TOTP_SECRET is not set");
    await code.fill(totp(secret));
    await page.getByRole("button", { name: /verify/i }).click();
  }

  // Landed anywhere off the auth routes = signed in.
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/auth\//);
}
