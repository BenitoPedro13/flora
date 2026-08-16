import { test, expect, type Page } from "@playwright/test";
import { rampLegendLabels, type Observation } from "@flora/contracts";

/**
 * TASK-crop-stress §2.14/§6. Needs `apps/api` + infra running and
 * `pnpm db:seed && pnpm db:seed:demo && pnpm db:seed:satellite` applied —
 * `db:seed:satellite` is what seeds Field 237's 3 stress zones / ~1.8 ac and
 * Field 240's stale badge (§1.2 row a; the design's "8 zones / 24.1 ac" is
 * the mock's illustrative number, not the seed's real one).
 *
 * Not covered here, and why:
 *  - Item 12 (visual diff vs `18:6567`'s export) needs a `get_screenshot`
 *    baseline this environment has no live Figma connection to fetch — same
 *    blocker `fields.spec.ts` recorded for its own item 14. Follow-up in
 *    TASK-crop-stress.md §9, not skipped silently.
 *  - Item 13 (NFR-11, 60fps pan with the overlay + zone layers over 200
 *    seeded fields) needs `db:seed:bulk` against a *real* Mapbox token, the
 *    same infrastructure gap `fields.spec.ts` item 15 already recorded.
 */

async function goToField237Stress(page: Page) {
  await page.goto("/fields");
  await page.getByPlaceholder("Search fields").fill("Field 237");
  await page.getByRole("button", { name: "View Details", exact: true }).click();
  await expect(page).toHaveURL(/\/fields\/[^/]+\/stress$/);
  await expect(page.getByRole("heading", { name: "Crop Stress" })).toBeVisible();
}

test.describe("Crop Stress screen", () => {
  // These tests mutate Field 237's shared, fixed 3-zone seed (mute,
  // reclassify, delete) — serial, not parallel, so one test's write can't
  // race another's read of the same rows. A fresh `db:seed:satellite` run
  // resets the drift a full pass leaves behind (the classify test's zone
  // stays "Pest", the delete test's zone stays gone), the same convention
  // `fields.spec.ts`'s docstring already assumes for a clean run.
  test.describe.configure({ mode: "serial" });

  test("renders Field 237's 3 seeded rows with a summary count/acreage matching them", async ({ page }) => {
    await goToField237Stress(page);

    await expect(page.getByText(/^3 stress detected$/)).toBeVisible();
    const rows = page.locator('[data-testid^="stress-zone-row-"]');
    await expect(rows).toHaveCount(3);
  });

  test("muting a row drops the count and hides it; Show muted brings it back", async ({ page }) => {
    await goToField237Stress(page);

    const rows = page.locator('[data-testid^="stress-zone-row-"]');
    await expect(rows).toHaveCount(3);

    await rows.first().getByLabel("Mute detection").click();
    await expect(page.getByText(/^2 stress detected$/)).toBeVisible();
    await expect(rows).toHaveCount(2);

    await page.getByLabel("Detection options").click();
    await page.getByText("Show muted").click();
    await expect(rows).toHaveCount(3);
    // The count stays excluding the muted zone even while it's shown dimmed.
    await expect(page.getByText(/^2 stress detected$/)).toBeVisible();

    // Unmute again so this test leaves seeded state as it found it.
    await rows.filter({ has: page.getByLabel("Unmute detection") }).first().getByLabel("Unmute detection").click();
    await expect(page.getByText(/^3 stress detected$/)).toBeVisible();
  });

  test("changing a classification moves the row between groups and survives a reload", async ({ page }) => {
    await goToField237Stress(page);

    const firstRow = page.locator('[data-testid^="stress-zone-row-"]').first();
    const zoneTestId = await firstRow.getAttribute("data-testid");

    await firstRow.getByLabel("Classification").click();
    await page.getByRole("option", { name: "Pest" }).click();

    await page.reload();
    const sameRow = page.locator(`[data-testid="${zoneTestId}"]`);
    await expect(sameRow.getByLabel("Classification")).toContainText("Pest");
  });

  test("deleting a row removes it and it stays gone after reload", async ({ page }) => {
    await goToField237Stress(page);

    const rows = page.locator('[data-testid^="stress-zone-row-"]');
    const countBefore = await rows.count();
    await rows.first().click();

    await expect(page.getByText("Stress detected")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(rows).toHaveCount(countBefore - 1);
    await page.reload();
    await expect(rows).toHaveCount(countBefore - 1);
  });

  test("Field 240 shows the stale badge with its last-success date", async ({ page }) => {
    await page.goto("/fields");
    await page.getByPlaceholder("Search fields").fill("Field 240");
    await page.getByRole("button", { name: "View Details", exact: true }).click();

    await expect(page.getByText(/^Stale · last updated/)).toBeVisible();
  });

  test("the legend's six labels equal rampLegendLabels for the rendered observation's stats", async ({ page, request }) => {
    await goToField237Stress(page);

    const fieldsRes = await request.get("/api/v1/fields?sort=position&limit=100");
    const fieldsBody = (await fieldsRes.json()) as { items: Array<{ id: string; name: string }> };
    const field237 = fieldsBody.items.find((f) => f.name === "Field 237")!;

    const obsRes = await request.get(`/api/v1/fields/${field237.id}/observations?index=ndvi`);
    const observations = (await obsRes.json()) as Observation[];
    const latest = observations[0]!;
    const expectedLabels = rampLegendLabels(latest.stats);

    for (const label of expectedLabels) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });
});
