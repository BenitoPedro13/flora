import type * as React from "react";
import { RiMessage3Line, RiTimeLine, RiUser3Line } from "@remixicon/react";
import type { Task } from "@flora/contracts";
import * as Avatar from "@/components/ui/avatar";
import * as AvatarGroup from "@/components/ui/avatar-group";
import * as Divider from "@/components/ui/divider";
import { ActivityTag } from "./activity-tag";

function formatDateRange(startsOn: string | null, dueOn: string | null): string | null {
  if (!startsOn && !dueOn) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (startsOn && dueOn) return `${fmt(startsOn)} - ${fmt(dueOn)}`;
  return fmt((startsOn ?? dueOn)!);
}

/**
 * A one-off 16px ring, not the vendored `ProgressCircle` (§1.3: the card's
 * ring is 16px; the component's smallest defined `size` variant is 44px).
 * Found live in the browser: `ProgressCircleRoot` applies its `className`
 * to the *wrapping* `<div>`, not the `<svg>` itself — the `size` prop alone
 * fixes the SVG's own pixel `width`/`height`, so overriding via a Tailwind
 * class on `className` silently does nothing and the ring renders at
 * whatever `size` variant was passed (80px, in this card's first cut),
 * overlapping everything below it. Cheaper to draw the 16px case directly
 * than to fight a component that was never built for it.
 */
function MiniProgressRing({ value }: { value: number }) {
  const radius = 6;
  const strokeWidth = 2.5;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={8} cy={8} r={radius} strokeWidth={strokeWidth} fill="none" className="stroke-bg-soft-200" />
      <circle
        cx={8}
        cy={8}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        fill="none"
        className="stroke-primary-base transition-all duration-300 ease-out"
      />
    </svg>
  );
}

export interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  draggableProps?: React.HTMLAttributes<HTMLDivElement>;
}

/**
 * `24:11420`'s card (§1.3, measured): the `Widgets [HR Management] [1.0]`
 * PRO block with its trailing-control/Stacked-Progress-Bar/Chart-Legends
 * layers hidden in every real instance — this composite never renders them
 * (§1.3 note 1). Every row renders real data honestly (§2.9): a null field
 * shows `Field: —` rather than hiding the row (hiding would change the
 * card's 184px height), a null `progressPct` shows an empty 0% ring, and a
 * fully-null date range leaves the footer's right cluster empty.
 */
export function TaskCard({ task, onClick, draggableProps }: TaskCardProps) {
  const dateRange = formatDateRange(task.startsOn, task.dueOn);

  return (
    <div
      data-testid={`task-card-${task.id}`}
      className="flex h-[184px] w-full flex-col gap-0 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4"
      onClick={onClick}
      {...draggableProps}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-paragraph-xs text-text-soft-400">Field:</span>
        <span className="truncate text-paragraph-xs text-text-strong-950">{task.field?.name ?? "—"}</span>
      </div>

      <Divider.Root className="my-3" />

      <h4 className="line-clamp-1 text-label-md text-text-strong-950">{task.title}</h4>

      <div className="mt-4 flex items-center gap-1">
        <MiniProgressRing value={task.progressPct ?? 0} />
        <span className="text-label-xs text-text-sub-600">{task.progressPct ?? 0}%</span>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <RiUser3Line className="size-4 shrink-0 text-text-soft-400" aria-hidden />
        {task.assignees.length > 0 ? (
          <AvatarGroup.Root size="20">
            {task.assignees.map((a) => (
              <Avatar.Root key={a.userId} size="20" color="gray">
                {(a.name ?? "?").slice(0, 1).toUpperCase()}
              </Avatar.Root>
            ))}
          </AvatarGroup.Root>
        ) : null}
        <ActivityTag activity={task.activity} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <RiMessage3Line className="size-4 text-text-soft-400" aria-hidden />
            <span className="text-label-xs text-text-sub-600">{task.commentCount}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* `time-line`, not a checkbox/list icon — §1.3 note 2 logs this as a design defect and ships it as drawn. */}
            <RiTimeLine className="size-4 text-text-soft-400" aria-hidden />
            <span className="text-label-xs text-text-sub-600">
              {task.subtaskDoneCount}/{task.subtaskCount}
            </span>
          </div>
        </div>
        {dateRange ? (
          <div className="flex items-center gap-1">
            <RiTimeLine className="size-4 text-text-soft-400" aria-hidden />
            <span className="text-label-xs text-text-sub-600">{dateRange}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
