import { test, expect, type Page } from "@playwright/test";

/**
 * TASK-tasks-board §2.11. Needs `apps/api` + infra running and
 * `pnpm db:seed && pnpm db:seed:demo` applied — the demo org's 4 fields each
 * get a `todo`, an `in_progress` and a `done` task (12 total), so the board
 * opens with all three columns populated (§2.10).
 */

async function goToTasks(page: Page) {
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

test.describe("Tasks board", () => {
  test("renders three columns whose header counts equal the seeded 4/4/4 split (§6 item 1)", async ({ page }) => {
    await goToTasks(page);

    await expect(page.getByTestId("kanban-column-todo")).toBeVisible();
    await expect(page.getByTestId("kanban-column-in_progress")).toBeVisible();
    await expect(page.getByTestId("kanban-column-done")).toBeVisible();

    await expect(page.getByTestId("kanban-column-todo").locator('[data-testid^="task-card-"]')).toHaveCount(4);
    await expect(page.getByTestId("kanban-column-in_progress").locator('[data-testid^="task-card-"]')).toHaveCount(4);
    await expect(page.getByTestId("kanban-column-done").locator('[data-testid^="task-card-"]')).toHaveCount(4);
  });

  test("a card shows real comment/subtask counts and a Field: row, not the mock's fixed numbers (§6 item 2)", async ({ page }) => {
    await goToTasks(page);

    const firstCard = page.getByTestId("kanban-column-todo").locator('[data-testid^="task-card-"]').first();
    await expect(firstCard.getByText("Field:")).toBeVisible();
    // Every seeded task has exactly 2 comments (§2.10's enrichTask) — asserted
    // against the seed's own fixed number, not the design's mock "2".
    await expect(firstCard.getByText("2", { exact: true })).toBeVisible();
  });

  test("+ Create Task writes a real row into the right column (§6 item 7)", async ({ page }) => {
    await goToTasks(page);

    const todoCountBefore = await page.getByTestId("kanban-column-todo").locator('[data-testid^="task-card-"]').count();

    await page.getByRole("button", { name: "Create Task" }).click();
    await expect(page.getByRole("heading", { name: "Create task" })).toBeVisible();
    await page.getByLabel("Title").fill("E2E-created task");
    // No field selected — the field select accepts no field (§6 item 7).
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { name: "Create task" })).toBeHidden();

    const todoCards = page.getByTestId("kanban-column-todo").locator('[data-testid^="task-card-"]');
    await expect(todoCards).toHaveCount(todoCountBefore + 1);
    const newCard = todoCards.filter({ hasText: "E2E-created task" });
    await expect(newCard).toBeVisible();
    await expect(newCard.getByText("Field: —")).toBeVisible();
  });

  test("dragging a card from To Do to In Progress lands it there, persists across reload, and both counts update (§6 item 3)", async ({
    page,
  }) => {
    await goToTasks(page);

    const todoColumn = page.getByTestId("kanban-column-todo");
    const inProgressColumn = page.getByTestId("kanban-column-in_progress");
    const todoBefore = await todoColumn.locator('[data-testid^="task-card-"]').count();
    const inProgressBefore = await inProgressColumn.locator('[data-testid^="task-card-"]').count();

    const card = todoColumn.locator('[data-testid^="task-card-"]').first();
    const cardTestId = await card.getAttribute("data-testid");
    const cardBox = await card.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();
    if (!cardBox || !targetBox) throw new Error("missing bounding box");

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 10 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 100, { steps: 10 });
    await page.mouse.up();

    await expect(inProgressColumn.locator(`[data-testid="${cardTestId}"]`)).toBeVisible();
    await expect(todoColumn.locator('[data-testid^="task-card-"]')).toHaveCount(todoBefore - 1);
    await expect(inProgressColumn.locator('[data-testid^="task-card-"]')).toHaveCount(inProgressBefore + 1);

    await page.reload();
    await expect(page.getByTestId("kanban-column-in_progress").locator(`[data-testid="${cardTestId}"]`)).toBeVisible();
  });

  // NFR-10: the `24:11420` export, fetched live via the Figma MCP this
  // environment has a real connection to (`TASK-tasks-board` §10) —
  // `shell.spec.ts`, `fields.spec.ts` and `stress.spec.ts` each recorded this
  // as unfetchable "in this environment"; it no longer is, and the export is
  // committed at `e2e/baselines/tasks-board.png`. **Not run in this session**
  // (§10): the dev server this suite drives points at the shared local
  // Postgres, which had the developer's own hand-created field data in it —
  // running the full suite risked mutating that state, so this test is
  // written and typechecked but its actual diff percentage is unverified.
  // The two decorative `Pattern` vectors (§1.3) aren't rendered by the shell
  // (a flexbox layout, not an absolute clone of the artboard's canvas) and
  // Playwright's `mask` option only targets page elements, not raw
  // baseline-image regions — if the real run comes in over budget because of
  // them, masking needs an actual placeholder element sized to their visible
  // area, not a locator for something that doesn't exist.
  test("matches the 24:11420 export within NFR-10's 2% budget", async ({ page }) => {
    await goToTasks(page);
    await expect(page).toHaveScreenshot("tasks-board.png");
  });
});
