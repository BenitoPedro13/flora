import { fieldSummarySchema, pageSchema, taskBoardSchema } from "@flora/contracts";
import { apiFetchServer } from "@/lib/api-client.server";
import { BoardPanel } from "./board-panel";

/**
 * The Tasks screen (`24:11420`, TASK-tasks-board §2.7) — the third and last
 * link of the spine (architecture §16): register the crop, see it struggle,
 * act on it. Fetches the board and the org's fields (for the toolbar's
 * Filter and the editor's field `Select`) server-side; the client panel
 * seeds its query cache from this via `initialData`.
 */
export default async function TasksPage() {
  const [board, fieldsPage] = await Promise.all([
    apiFetchServer("/api/v1/tasks?view=board&sort=position", taskBoardSchema),
    apiFetchServer("/api/v1/fields?sort=position&limit=100", pageSchema(fieldSummarySchema)),
  ]);

  return <BoardPanel initialBoard={board} fields={fieldsPage.items} />;
}
