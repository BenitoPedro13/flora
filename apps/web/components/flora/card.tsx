import * as React from "react";
import { cn } from "@/utils/cn";

/**
 * The card anatomy shared by every screen (design-spec §4.5): white surface,
 * 1px soft border, 16px radius, 16px padding. `CardHeader`'s trailing slot is
 * part of the header, not per-card decoration — every screen composes it the
 * same way (an icon, a title, and an optional trailing control).
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  trailing,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-2", className)}>
      {icon ? <span className="size-6 shrink-0 text-text-sub-600">{icon}</span> : null}
      <h3 className="flex-1 truncate text-label-lg text-text-strong-950">{title}</h3>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
