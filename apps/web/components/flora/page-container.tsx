import * as React from "react";
import { cn } from "@/utils/cn";

/**
 * The fluid, `max-width`-capped content column every screen used before
 * Fields (TASK-fields §2.10) — pulled out of `(app)/layout.tsx` because
 * Fields' map is full-bleed and cannot live inside a centered 1110px column.
 * Home, Tasks and Weather adopt this directly; Fields does not.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex min-w-0 flex-1 justify-center">
      <div className={cn("w-full max-w-[1110px] px-8", className)} {...props} />
    </div>
  );
}
