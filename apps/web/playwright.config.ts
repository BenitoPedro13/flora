import { defineConfig, devices } from "@playwright/test";

/**
 * `shell.spec.ts` (TASK-design-system-shell §2.10), `fields.spec.ts`
 * (TASK-fields §6), and `stress.spec.ts` (TASK-crop-stress §2.14) — the
 * `chromium` project's `testMatch` grows with each screen task. 1440×900
 * and maxDiffPixelRatio 0.02 are NFR-10's numbers.
 */
export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    contextOptions: { reducedMotion: "reduce" },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "chromium",
      testMatch: /shell\.spec\.ts|fields\.spec\.ts|stress\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        storageState: "e2e/.auth/owner.json",
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
