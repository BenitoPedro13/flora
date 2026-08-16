import type * as React from "react";
import { RiInformationFill } from "@remixicon/react";
import * as Tooltip from "@/components/ui/tooltip";
import { IconTile } from "./icon-tile";
import { DeltaBadge } from "./delta-badge";

/**
 * §1.3: a single bordered container with internal dividers, **not four
 * separate cards** — three 214.33px KPI cells then one 467px cell (the
 * caller supplies the fourth child, `CropsStockedCard`).
 */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[218px] items-stretch divide-x divide-stroke-soft-200 rounded-2xl border border-stroke-soft-200 bg-bg-white-0">
      {children}
    </div>
  );
}

export interface KpiTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  deltaPct: number | null;
  /** The info icon's tooltip — always names the comparison window (§2.3), e.g. "vs. 7 days ago". */
  tooltip: string;
}

/** 56×56 `bg-weak-50` icon tile, label + info icon, value + delta badge (§1.3). */
export function KpiTile({ icon: Icon, label, value, deltaPct, tooltip }: KpiTileProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-6">
      <IconTile size="56" tone="weak">
        <Icon className="size-[26px] text-primary-base" />
      </IconTile>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-label-sm text-text-sub-600">{label}</span>
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <span className="inline-flex shrink-0">
                  <RiInformationFill className="size-4 text-information-base" aria-hidden />
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>{tooltip}</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-label-xl text-text-strong-950">{value}</span>
          <DeltaBadge deltaPct={deltaPct} />
        </div>
      </div>
    </div>
  );
}
