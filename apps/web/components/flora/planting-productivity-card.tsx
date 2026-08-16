import { RiSettings4Line } from "@remixicon/react";
import type { DashboardPlantingProductivity } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Tooltip from "@/components/ui/tooltip";
import { PlantingProductivityChart } from "@/components/charts/planting-productivity-chart";

/** §1.3: 759×270, a 12-month stacked column chart. */
export function PlantingProductivityCard({ months }: { months: DashboardPlantingProductivity }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-8 items-center gap-2">
        <RiSettings4Line className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Planting Productivity</h3>
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

      <div className="mt-4 h-[190px]">
        <PlantingProductivityChart months={months} />
      </div>
    </div>
  );
}
