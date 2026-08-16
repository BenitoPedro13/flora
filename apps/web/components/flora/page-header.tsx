import * as React from "react";
import { cn } from "@/utils/cn";

/**
 * The rebuilt `Page Header [1.0]` PRO block (design-spec §6.2), slot-based
 * because the design uses it three different ways (Home / Fields / Tasks).
 * 88px tall, 32px content inset from the sidebar (design-spec §4.1).
 */
export function PageHeader({
  leading,
  title,
  subtitle,
  actions,
  className,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-[88px] shrink-0 items-center justify-between gap-4 border-b border-stroke-soft-200 px-8",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-title-h5 text-text-strong-950">{title}</h1>
          {subtitle ? (
            <p className="truncate text-paragraph-sm text-text-sub-600">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  );
}
