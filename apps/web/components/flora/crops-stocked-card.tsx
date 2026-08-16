import Link from "next/link";
import { RiPlantLine } from "@remixicon/react";
import type { DashboardCropsStocked } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Divider from "@/components/ui/divider";
import { CropDonut } from "@/components/charts/crop-donut";
import { chartSeriesColors } from "@/components/charts/config";
import { cn } from "@/utils/cn";

const LEGEND_COLS = 2;

/**
 * The 467px fourth `KpiRow` cell (§1.3) — donut + a 2×2 legend grid,
 * `Details` links to the real Fields screen. Built as **one CSS grid**
 * (donut column | legend column), not a flex row with a gap: a `divide-x`
 * on a grid spans the full row height and lines up exactly with the
 * legend's own internal `divide-x`/`divide-y`, giving one continuous
 * vertical line from the header divider to the bottom corner — the way the
 * Figma reference draws it. A flex row with a gap has no shared line to
 * connect to, found live comparing against the reference directly.
 */
export function CropsStockedCard({ cropsStocked }: { cropsStocked: DashboardCropsStocked }) {
  const topFour = cropsStocked.byCrop.slice(0, 4);

  return (
    <div className="flex w-116.75 shrink-0 flex-col">
      <div className="flex h-16.5 shrink-0 items-center gap-2 px-4">
        <RiPlantLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Crops Stocked</h3>
        <Button.Root asChild variant="neutral" mode="stroke" size="xsmall">
          <Link href="/fields">Details</Link>
        </Button.Root>
      </div>
      <Divider.Root />
      <div className="grid flex-1 grid-cols-[auto_1fr] divide-x divide-stroke-soft-200">
        <div className="flex items-center justify-center p-4">
          <CropDonut totalKg={cropsStocked.totalKg} byCrop={topFour} />
        </div>
        {topFour.length > 0 ? (
          // `divide-x`/`divide-y` are 1D utilities — "every child but the
          // first" — and don't know about grid row/column boundaries, so on
          // a 2×2 grid they put borders on the wrong edges (found live,
          // comparing against the Figma reference directly). Explicit
          // per-cell border-right/border-bottom, keyed off row/col, is what
          // actually draws the centered "+" divider the reference shows.
          <div className="grid min-w-0 grid-cols-2">
            {topFour.map((crop, i) => {
              const isLastCol = i % LEGEND_COLS === LEGEND_COLS - 1 || i === topFour.length - 1;
              const isLastRow = i >= topFour.length - (topFour.length % LEGEND_COLS || LEGEND_COLS);
              return (
                <div
                  key={crop.crop}
                  className={cn(
                    "flex flex-col justify-center gap-2 p-3",
                    !isLastCol && "border-r border-stroke-soft-200",
                    !isLastRow && "border-b border-stroke-soft-200",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: chartSeriesColors[i % chartSeriesColors.length] }}
                      aria-hidden
                    />
                    <span className="truncate text-paragraph-xs text-text-sub-600">{crop.crop}</span>
                  </div>
                  <span className="text-label-md text-text-strong-950">{crop.sharePct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="flex items-center p-3 text-paragraph-sm text-text-soft-400">
            No harvested crops in the trailing 12 months.
          </p>
        )}
      </div>
    </div>
  );
}
