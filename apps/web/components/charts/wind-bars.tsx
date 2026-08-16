"use client";

import type { WeatherHour } from "@flora/contracts";
import { Bar, BarChart, Cell } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const CHART_CONFIG: ChartConfig = { windSpeedKmh: { label: "Wind speed", color: "var(--chart-1)" } };

export interface WindBarsProps {
  hours: WeatherHour[];
  /** The bar to highlight — the current hour, when the selected day is today. */
  highlightTime?: string;
  className?: string;
}

/**
 * `102:6216`'s bar plot, re-pitched (§7 decision 2, TASK-weather): **24
 * bars, one per hour of the selected day**, not the mock's 19 — matching the
 * mock would mean dropping five real hours to fit a drawing. Same 320×130
 * box, rounded caps, no axes/grid.
 */
export function WindBars({ hours, highlightTime, className }: WindBarsProps) {
  const data = hours.map((h) => ({ time: h.time, windSpeedKmh: h.windSpeedKmh ?? 0 }));
  return (
    <ChartContainer config={CHART_CONFIG} className={className ?? "aspect-auto h-full w-full"}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
        <Bar dataKey="windSpeedKmh" radius={999} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.time} fill={d.time === highlightTime ? "var(--chart-1)" : "var(--color-green-300)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
