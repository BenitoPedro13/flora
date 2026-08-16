import { test as setup, expect } from "@playwright/test";

const CREDENTIALS = { email: "owner@flora.local", password: "flora-dev-owner-password" };
const AUTH_FILE = "e2e/.auth/owner.json";

/**
 * Logs in once and saves storage state for every other test to reuse.
 * `/api/v1/auth/login` is rate-limited to 5 requests / 15 min per IP
 * (apps/api/src/auth/auth.module.ts) — logging in per-test would exhaust
 * that budget under Playwright's default parallelism.
 */
setup("authenticate", async ({ page }) => {
  const res = await page.request.post("/api/v1/auth/login", { data: CREDENTIALS });
  expect(res.ok()).toBeTruthy();
  await page.context().storageState({ path: AUTH_FILE });
});
