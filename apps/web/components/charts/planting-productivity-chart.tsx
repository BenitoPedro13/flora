"use client";

import type { PlantingProductivityMonth } from "@flora/contracts";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chartAxisLabelClassName, chartConfigFromKeys, chartGridStroke, chartSeriesColors } from "./config";

export interface PlantingProductivityChartProps {
  months: PlantingProductivityMonth[];
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/**
 * Share of the farm's field area under an active crop cycle per month,
 * stacked by crop (§7 decision 5) — totals vary month to month rather than
 * always summing to 100%, since a month with fallow area stacks to less.
 */
export function PlantingProductivityChart({ months }: PlantingProductivityChartProps) {
  const crops = Array.from(new Set(months.flatMap((m) => m.byCrop.map((c) => c.crop)))).sort();
  const config = chartConfigFromKeys(crops);
  const data = months.map((m) => {
    const row: Record<string, string | number> = { month: monthLabel(m.month) };
    for (const c of m.byCrop) {
      row[c.crop] = c.sharePct;
    }
    return row;
  });

  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={data} barSize={40}>
        <CartesianGrid vertical={false} stroke={chartGridStroke} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} className={chartAxisLabelClassName} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={40}
          className={chartAxisLabelClassName}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="border-none bg-[var(--color-static-black)] text-[var(--color-static-white)]"
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-[var(--color-static-white)]/70">{name}</span>
                  <span className="font-medium tabular-nums">{Number(value).toFixed(1)}%</span>
                </div>
              )}
            />
          }
        />
        {crops.map((crop, i) => (
          <Bar
            key={crop}
            dataKey={crop}
            stackId="productivity"
            fill={chartSeriesColors[i % chartSeriesColors.length]}
            radius={i === crops.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
