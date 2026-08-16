import { RiArrowDownLine, RiArrowUpLine, RiShoppingBasketLine } from "@remixicon/react";
import type { DashboardGatheringRate } from "@flora/contracts";
import { kilogramsToTonnes } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as ButtonGroup from "@/components/ui/button-group";
import * as Tooltip from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { GatheringRateChart } from "@/components/charts/gathering-rate-chart";
import { DeltaBadge } from "./delta-badge";

/** The design's `1D 1W 1M 3M 1Y` range group — only 1M has real data behind it (§2.7 built a fixed 30-day window), so the rest are disabled with a tooltip, the same treatment every other undesigned control gets. */
const RANGES = ["1D", "1W", "1M", "3M", "1Y"] as const;
const ACTIVE_RANGE = "1M";

/** §1.3, §7 decision 6: top two crops by harvested volume replace the design's e-commerce channel rows — real data, same row geometry. */
export function GatheringRateCard({ gatheringRate }: { gatheringRate: DashboardGatheringRate }) {
  return (
    <div className="flex w-[335px] shrink-0 flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-7 items-center gap-2">
        <RiShoppingBasketLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Gathering Rate</h3>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <span>
                <Button.Root variant="neutral" mode="stroke" size="xsmall" disabled>
                  Details
                </Button.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>No detail screen exists for this yet</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <span className="text-label-xl text-text-strong-950">{kilogramsToTonnes(gatheringRate.ratePerDayKg).toFixed(2)}T</span>
        <span className="pb-0.5 text-paragraph-sm text-text-sub-600">/day</span>
        <div className="pb-0.5">
          <DeltaBadge deltaPct={gatheringRate.deltaPct} />
        </div>
      </div>

      <Tooltip.Provider>
        <ButtonGroup.Root size="xsmall" className="mt-5 w-full [&>button]:flex-1">
          {RANGES.map((range) =>
            range === ACTIVE_RANGE ? (
              <ButtonGroup.Item key={range} type="button" data-state="on" disabled>
                {range}
              </ButtonGroup.Item>
            ) : (
              <Tooltip.Root key={range} delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <ButtonGroup.Item type="button" data-state="off" disabled>
                    {range}
                  </ButtonGroup.Item>
                </Tooltip.Trigger>
                <Tooltip.Content>Only the trailing 30 days is available for now</Tooltip.Content>
              </Tooltip.Root>
            ),
          )}
        </ButtonGroup.Root>
      </Tooltip.Provider>

      <div className="mt-4 h-[138px]">
        <GatheringRateChart series={gatheringRate.series} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {gatheringRate.topCrops.length === 0 ? (
          <p className="text-paragraph-xs text-text-soft-400">No harvests in the trailing 30 days.</p>
        ) : (
          gatheringRate.topCrops.map((crop) => (
            <div key={crop.crop} className="flex items-center gap-2">
              <span className="flex-1 truncate text-label-sm text-text-strong-950">{crop.crop}</span>
              <span className="text-label-sm text-text-sub-600">{kilogramsToTonnes(crop.kg).toFixed(2)} T</span>
              {crop.deltaPct !== null ? (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-label-xs",
                    crop.deltaPct >= 0 ? "text-success-base" : "text-error-base",
                  )}
                >
                  {crop.deltaPct >= 0 ? (
                    <RiArrowUpLine className="size-3.5" aria-hidden />
                  ) : (
                    <RiArrowDownLine className="size-3.5" aria-hidden />
                  )}
                  {Math.abs(crop.deltaPct).toFixed(0)}%
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
