import * as React from "react";
import * as Button from "@/components/ui/button";
import * as Tooltip from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";

export interface InstrumentCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  footerValue?: React.ReactNode;
  footerMeta?: React.ReactNode;
  className?: string;
}

/**
 * TASK-weather §1.3/§2.6 — the reuse win. All six instrument cards on
 * `3:5274` share one skeleton: a 24px icon + title + a disabled `See All`
 * (§7 decision 9, `D5` stays open — the same treatment
 * `TASK-crop-stress`/`TASK-tasks-board`/`TASK-home-dashboard` each chose),
 * an instrument body, and a footer value/timestamp pair right-aligned. One
 * chrome, one tooltip string, six call sites.
 */
export function InstrumentCard({ icon: Icon, title, children, footerValue, footerMeta, className }: InstrumentCardProps) {
  return (
    <div className={cn("flex w-[352px] flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4", className)}>
      <div className="flex h-8 shrink-0 items-center gap-2">
        <Icon className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">{title}</h3>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <span>
                <Button.Root variant="neutral" mode="stroke" size="xsmall" disabled>
                  See All
                </Button.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>There&apos;s no Weather detail screen yet</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
      <div className="mt-4 flex flex-1 items-center justify-center">{children}</div>
      {footerValue !== undefined || footerMeta !== undefined ? (
        <div className="mt-3 flex shrink-0 items-center justify-between text-label-sm text-text-strong-950">
          <span className="truncate">{footerValue}</span>
          <span className="shrink-0 truncate text-paragraph-xs text-text-sub-600">{footerMeta}</span>
        </div>
      ) : null}
    </div>
  );
}
