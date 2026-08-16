import Link from "next/link";
import { RiTaskLine } from "@remixicon/react";
import type { Task } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import { TaskCard } from "./task-card";

/** §1.3: the same `Widgets [HR Management]` block as the board's, with the footer row dropped (184 → 156, `TaskCard`'s `compact` variant). Never rolled up (§3) — a live read, so a task finished a minute ago shows correctly. */
export function PendingTasksCard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="flex w-[335px] shrink-0 flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-7 items-center gap-2">
        <RiTaskLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Pending Tasks</h3>
        <Button.Root asChild variant="neutral" mode="stroke" size="xsmall">
          <Link href="/tasks">Details</Link>
        </Button.Root>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-paragraph-xs text-text-soft-400">Nothing pending — you're all caught up.</p>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} compact />)
        )}
      </div>
    </div>
  );
}
