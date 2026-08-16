"use client";

import * as React from "react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/utils/cn";

export interface ArcGaugeProps {
  value: number;
  max?: number;
  label: React.ReactNode;
  valueLabel?: React.ReactNode;
  className?: string;
}

const CHART_CONFIG: ChartConfig = { value: { label: "Value", color: "var(--chart-1)" } };

/**
 * A reusable 180° arc gauge (design-spec §6.2 maps `Gauge Bar [Time Off]
 * [1.0]` to this) — `startAngle 180 / endAngle 0`, rounded cap, green fill on
 * a light track. Kept generic (`value`/`max`/`label`), not score-specific —
 * Weather's Rain Chance (Phase 5) reuses it (TASK-home-dashboard §2.10).
 */
export function ArcGauge({ value, max = 100, label, valueLabel, className }: ArcGaugeProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const data = [{ name: "value", value: clamped }];

  return (
    <div className={cn("relative flex h-full w-full items-end justify-center", className)}>
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
        <RadialBarChart data={data} startAngle={180} endAngle={0} cx="50%" cy="95%" innerRadius="90%" outerRadius="120%" barSize={10}>
          <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            background={{ fill: "var(--color-bg-weak-50)" }}
            fill="var(--chart-1)"
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 pb-2">
        <span className="text-title-h4 text-text-strong-950">{valueLabel ?? clamped}</span>
        <span className="text-subheading-2xs uppercase text-text-soft-400">{label}</span>
      </div>
    </div>
  );
}
