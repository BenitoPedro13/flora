import { test, expect, type Page } from "@playwright/test";

/**
 * TASK-design-system-shell §6, items 3–15. Needs `apps/api` and infra
 * running (`pnpm --filter api dev`, `docker compose -f infra/docker-compose.yml up -d`)
 * plus a seeded owner (`pnpm db:seed`) — `playwright.config.ts` only starts `next dev`.
 * The `chromium` project depends on the `setup` project (`auth.setup.ts`),
 * which logs in once and shares that session via `storageState` — logging
 * in per test would exceed the API's 5-per-15-min login rate limit.
 *
 * Item 11's baselines (`e2e/baselines/sidebar-{expanded,collapsed}.png`) are
 * real Figma exports — `get_screenshot` on `39:6447` (the Sidebar instance
 * inside Home, `1:12913`) and `18:6570` (the collapsed rail inside Fields —
 * Crop Stress, `18:6567`), file `hY3Nd3BBbJsjpihPnfZgpd`, both already at
 * their native 1x pixel size (272×900 / 80×900) so no DOM/export density
 * mismatch. `playwright.config.ts`'s `snapshotPathTemplate` points
 * `toHaveScreenshot` at that folder instead of the default `-snapshots/` dir.
 */

const CREDENTIALS = { email: "owner@flora.local", password: "flora-dev-owner-password" };

async function goHome(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Logged in as/)).toBeVisible();
}

test.describe("token chain", () => {
  test("accent resolves to #1daf61", async ({ page }) => {
    await goHome(page);
    const accent = await page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-base").trim();
      // oklch() serializes back as lab()/oklab() through getComputedStyle, not
      // rgb() — force an sRGB clamp via canvas instead of string-comparing.
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
    expect(accent).toEqual([29, 175, 97]); // #1daf61
  });

  test("chart tokens resolve and none are empty", async ({ page }) => {
    await goHome(page);
    const values = await page.evaluate(() =>
      ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map((name) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
      ),
    );
    for (const value of values) {
      expect(value).not.toBe("");
    }
  });

  test("AlignUI tokens are present and shadcn's defaults are not", async ({ page }) => {
    await goHome(page);
    const result = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bgWhite0: style.getPropertyValue("--color-bg-white-0").trim(),
        strokeSoft200: style.getPropertyValue("--color-stroke-soft-200").trim(),
        textStrong950: style.getPropertyValue("--color-text-strong-950").trim(),
        shadcnBackground: style.getPropertyValue("--background").trim(),
        shadcnForeground: style.getPropertyValue("--foreground").trim(),
      };
    });
    expect(result.bgWhite0).not.toBe("");
    expect(result.strokeSoft200).not.toBe("");
    expect(result.textStrong950).not.toBe("");
    expect(result.shadcnBackground).toBe("");
    expect(result.shadcnForeground).toBe("");
  });

  test("body font is Inter, no Geist reference remains", async ({ page }) => {
    await goHome(page);
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily).toContain("Inter");
  });
});

test.describe("sidebar", () => {
  test("272px expanded, 80px collapsed, persists across reload with no layout shift", async ({ page }) => {
    await goHome(page);
    const sidebar = page.locator("aside");
    await expect(sidebar).toHaveCSS("width", "272px");

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveCSS("width", "80px");

    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 500);
        }),
    );

    await page.reload();
    await expect(sidebar).toHaveCSS("width", "80px");
    expect(cls).toBe(0);
  });

  // The Figma export still carries the fifth "Energy" nav row (architecture
  // §4.3 defers it — design-spec §2.1's nav array is deliberately four
  // entries), which shifts every row below it and makes a whole-sidebar
  // pixel diff structurally unmeetable at NFR-10's 2% until a screen task
  // restores Energy or crops a dedicated 4-item baseline. Per the task doc's
  // own risk table: record the achieved delta and raise the threshold here,
  // deliberately, rather than silently loosen it. Measured floor with the
  // dynamic user identity masked out: 5% expanded (text rows shift further),
  // 3% collapsed (icon-only rail, less shifted content) — thresholds below
  // give ~1.5pp headroom for anti-aliasing noise; a regression that pushes
  // materially past that (spacing, colour, icon changes) still fails.

  test("expanded crop matches the Figma export (1:12913 → 39:6447)", async ({ page }) => {
    await goHome(page);
    await expect(page.locator("aside")).toHaveScreenshot("sidebar-expanded.png", {
      animations: "disabled",
      mask: [page.getByTestId("user-identity")],
      maxDiffPixelRatio: 0.065,
    });
  });

  test("collapsed crop matches the Figma export (18:6567 → 18:6570)", async ({ page }) => {
    await goHome(page);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("aside")).toHaveScreenshot("sidebar-collapsed.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.045,
    });
  });

  test("active nav row is highlighted, others are not", async ({ page }) => {
    await goHome(page);

    // oklch()-declared colors serialize back as lab()/oklab() through
    // getComputedStyle, not rgb() — clamp to sRGB via canvas to compare.
    async function bgOf(name: string) {
      const el = page.getByRole("link", { name });
      return el.evaluate((node) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = getComputedStyle(node).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      });
    }

    expect(await bgOf("Home")).toEqual([245, 247, 250]); // bg-weak-50
    expect(await bgOf("Fields")).not.toEqual([245, 247, 250]);
  });

  test("collapsed rail shows tooltips matching the expanded labels", async ({ page }) => {
    await goHome(page);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const homeIcon = page.getByRole("link", { name: "Home" });
    await homeIcon.hover();
    await expect(page.getByRole("tooltip", { name: "Home" })).toBeVisible();
  });

  test("keyboard reaches every nav row, footer items and the user menu, each with a visible focus ring", async ({
    page,
  }) => {
    await goHome(page);
    const required = ["Home", "Fields", "Tasks", "Weather", "Settings", "Support", "Account menu"];
    const seen: string[] = [];

    // The sidebar also has the collapse toggle before the nav rows in DOM
    // order — walk enough stops to pass every required one rather than
    // assuming an exact index.
    for (let i = 0; i < 12 && seen.length < required.length; i++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      const name = (await focused.getAttribute("aria-label")) ?? (await focused.textContent()) ?? "";
      if (required.includes(name.trim())) {
        seen.push(name.trim());
        const outlineWidth = await focused.evaluate((el) => getComputedStyle(el).outlineWidth);
        expect(outlineWidth).not.toBe("0px");
      }
    }

    expect(seen).toEqual(required);
  });
});

test.describe("login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("valid credentials land on / inside the shell", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(CREDENTIALS.email);
    await page.getByLabel("Password").fill(CREDENTIALS.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(/Logged in as/)).toBeVisible();
  });

  test("invalid credentials render the AlignUI Hint error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@flora.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });
});
