"use client";

import type { GatheringRatePoint } from "@flora/contracts";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { chartAxisLabelClassName, chartGridStroke } from "./config";

export interface GatheringRateChartProps {
  series: GatheringRatePoint[];
}

const CHART_CONFIG: ChartConfig = {
  currentKg: { label: "This period", color: "var(--chart-1)" },
  previousKg: { label: "Previous period", color: "var(--chart-3)" },
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
}

/**
 * The trailing-26-week series (§2.7) re-bucketed to months for display —
 * design-spec's own "two area vectors" (§1.3). Found live: harvests land on
 * 1–2 specific weeks out of 26, so a 303px-wide chart gave each week an
 * ~11px hover column — too narrow to reliably land the tooltip on the one
 * or two weeks that actually have data. The chart type was never the
 * problem (Recharts' hover is index-based off the shared x-axis category,
 * not the curve's rendered height); six wide monthly columns instead of
 * twenty-six slivers is what actually fixes it.
 */
export function GatheringRateChart({ series }: GatheringRateChartProps) {
  const byMonth = new Map<string, { currentKg: number; previousKg: number }>();
  for (const point of series) {
    const key = monthKey(point.weekStart);
    const bucket = byMonth.get(key) ?? { currentKg: 0, previousKg: 0 };
    bucket.currentKg += point.currentKg;
    bucket.previousKg += point.previousKg;
    byMonth.set(key, bucket);
  }
  const data = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({ month: monthLabel(key), ...bucket }));

  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gatheringRateCurrentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chartGridStroke} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} className={chartAxisLabelClassName} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="border-none bg-[var(--color-static-black)] text-[var(--color-static-white)]"
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-[var(--color-static-white)]/70">
                    {name === "currentKg" ? "This period" : "Previous period"}
                  </span>
                  <span className="font-medium tabular-nums">{Number(value).toFixed(0)} kg</span>
                </div>
              )}
            />
          }
        />
        <Area
          type="linear"
          dataKey="previousKg"
          stroke="var(--chart-3)"
          strokeDasharray="4 4"
          fill="none"
          isAnimationActive={false}
        />
        <Area
          type="linear"
          dataKey="currentKg"
          stroke="var(--chart-1)"
          fill="url(#gatheringRateCurrentFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
