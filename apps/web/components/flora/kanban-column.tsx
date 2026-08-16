import type * as React from "react";
import { RiAddLine, RiMoreLine } from "@remixicon/react";
import type { TaskStatus } from "@flora/contracts";
import * as Badge from "@/components/ui/badge";
import * as Button from "@/components/ui/button";
import * as CompactButton from "@/components/ui/compact-button";
import * as Tooltip from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

/** `todo` is a neutral grey dot in `24:11420`, not blue — corrected against the Figma export the developer re-shared live. */
const STATUS_DOT_CLASS: Record<TaskStatus, string> = {
  todo: "bg-faded-base",
  in_progress: "bg-warning-base",
  done: "bg-success-base",
};

export interface KanbanColumnProps {
  status: TaskStatus;
  count: number;
  onAddTask: (status: TaskStatus) => void;
  /** The card list — a drag-droppable region owned by `KanbanBoard` (§2.6/§2.8: this component stays dumb about dnd-kit). */
  children?: React.ReactNode;
}

/**
 * `Frame 59` (§1.3, measured): a `bg-weak-50` column that hugs its content
 * — `To Do` is 493px tall with 2 cards, the other two 688px with 3 — never
 * an equal-height grid. The header's second `Compact Button` (a `⋯`
 * overflow) has no backing in the design or the plan's §7 decisions;
 * disabled with a tooltip, the same treatment §7 gave List/Timeline/Import
 * rather than inventing a menu (logged as a gap, §2.12).
 */
export function KanbanColumn({ status, count, onAddTask, children }: KanbanColumnProps) {
  return (
    <div
      data-testid={`kanban-column-${status}`}
      className="flex min-w-[280px] flex-1 flex-col gap-0 rounded-2xl bg-bg-weak-50 p-[17px]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[25px]">
          <div className="flex items-center gap-2">
            <span className={cn("size-3 shrink-0 rounded-full", STATUS_DOT_CLASS[status])} aria-hidden />
            <span className="text-label-md text-text-strong-950">{STATUS_LABEL[status]}</span>
          </div>
          <Badge.Root color="gray" variant="filled" size="medium">
            {count}
          </Badge.Root>
        </div>
        <div className="flex items-center gap-2">
          <CompactButton.Root
            variant="ghost"
            size="medium"
            onClick={() => onAddTask(status)}
            aria-label={`Add task to ${STATUS_LABEL[status]}`}
          >
            <CompactButton.Icon as={RiAddLine} />
          </CompactButton.Root>
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <span>
                  <CompactButton.Root variant="ghost" size="medium" disabled aria-label="More options">
                    <CompactButton.Icon as={RiMoreLine} />
                  </CompactButton.Root>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>Column options — not designed yet</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>

      {children}

      <Button.Root
        variant="neutral"
        mode="ghost"
        size="small"
        className="mt-[11px] w-[99px]"
        onClick={() => onAddTask(status)}
      >
        <Button.Icon as={RiAddLine} />
        Add task
      </Button.Root>
    </div>
  );
}
