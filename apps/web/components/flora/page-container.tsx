import * as React from "react";
import { cn } from "@/utils/cn";

/**
 * The fluid, `max-width`-capped content column every screen used before
 * Fields (TASK-fields §2.10) — pulled out of `(app)/layout.tsx` because
 * Fields' map is full-bleed and cannot live inside a centered 1110px column.
 * Home, Tasks and Weather adopt this directly; Fields does not.
 *
 * **Corrected 2026-08-16 (`TASK-tasks-board` §7 decision 5):** was
 * `max-w-[1110px] px-8` — 1046px of content, 68px narrower than
 * design-spec §4.1's stated content-column width and 22px narrower than
 * `24:11420`'s own measured 1114px artboard. `max-w-[1168px] px-8` gives
 * 1104px of content: design-spec §4.1's own "build to 32px insets" rule
 * applied to the artboard, 10px (0.9%) off measured and comfortably inside
 * NFR-10's 2% diff budget. The only consumer before this task was the Home
 * stub.
 *
 * **`min-h-0` on both divs, added for `TASK-tasks-board`:** found live —
 * without it, a caller's `overflow-y-auto` (Tasks' board) never actually
 * scrolls. `(app)/layout.tsx`'s `<main>` is a column flex container, and a
 * flex item's default `min-height: auto` refuses to shrink below its
 * content size no matter what `overflow` says; `main`'s own
 * `overflow-hidden` then just clips the excess instead of the child
 * scrolling it into view. `min-h-0` is what lets a flex child actually be
 * bounded by its parent's height in the first place.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 justify-center">
      <div className={cn("min-h-0 w-full max-w-[1168px] px-8", className)} {...props} />
    </div>
  );
}
