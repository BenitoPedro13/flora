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
  /** `RadialBarChart`'s own sweep, degrees. Defaults to the 180° half-arc. */
  startAngle?: number;
  endAngle?: number;
  /** Vertical centre of the arc — `"95%"` bottom-aligns a half-arc; a full ring wants `"50%"`. */
  cy?: string;
  trackColor?: string;
  fillColor?: string;
  /** `"bottom"` (the half-arc's original placement) or `"center"` (a full ring). */
  labelPosition?: "bottom" | "center";
  innerRadius?: string;
  outerRadius?: string;
}

const CHART_CONFIG: ChartConfig = { value: { label: "Value", color: "var(--chart-1)" } };

/**
 * A reusable arc/ring gauge (design-spec §6.2 maps `Gauge Bar [Time Off]
 * [1.0]` to this) — `startAngle 180 / endAngle 0` by default, rounded cap,
 * green fill on a light track. Kept generic (`value`/`max`/`label`), not
 * score-specific. **Extended for TASK-weather** with `startAngle`/`endAngle`/
 * `cy`/colour props rather than forked: `RadialGauge` below is a full-circle
 * preset built on the same component, per §2.5's "one gauge component, two
 * presets" call — Rain Chance's `2029:27267` measures as a full 132px ring
 * with a partial sweep, not the 180° half-arc this component's own doc
 * comment once predicted it would reuse (§1.3 note 4).
 */
export function ArcGauge({
  value,
  max = 100,
  label,
  valueLabel,
  className,
  startAngle = 180,
  endAngle = 0,
  cy = "95%",
  trackColor = "var(--color-bg-weak-50)",
  fillColor = "var(--chart-1)",
  labelPosition = "bottom",
  innerRadius = "90%",
  outerRadius = "120%",
}: ArcGaugeProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const data = [{ name: "value", value: clamped }];

  return (
    <div
      className={cn(
        "relative flex h-full w-full",
        labelPosition === "bottom" ? "items-end justify-center" : "items-center justify-center",
        className,
      )}
    >
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
        <RadialBarChart data={data} startAngle={startAngle} endAngle={endAngle} cx="50%" cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} barSize={10}>
          <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            background={{ fill: trackColor }}
            fill={fillColor}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>
      <div
        className={cn(
          "pointer-events-none absolute flex flex-col items-center gap-1",
          labelPosition === "bottom" ? "inset-x-0 bottom-0 pb-2" : "inset-0 justify-center",
        )}
      >
        <span className="text-title-h4 text-text-strong-950">{valueLabel ?? clamped}</span>
        <span className="text-subheading-2xs uppercase text-text-soft-400">{label}</span>
      </div>
    </div>
  );
}

export type RadialGaugeProps = Omit<ArcGaugeProps, "startAngle" | "endAngle" | "cy" | "labelPosition">;

/**
 * The full-circle preset Rain Chance's ring needs — see the `ArcGauge` doc
 * comment above. **`innerRadius`/`outerRadius` default lower than the
 * half-arc's 90%/120%** — found live: at 120%, a *full* 360° sweep's ring
 * gets clipped by the SVG's own viewBox on all four sides ("cut by the
 * walls"), not just bled past an edge the half-arc's bottom-anchored layout
 * happened to hide. 78%/96% keeps the whole ring inside the box with a
 * small margin.
 */
export function RadialGauge({ innerRadius = "78%", outerRadius = "96%", ...props }: RadialGaugeProps) {
  return (
    <ArcGauge
      {...props}
      startAngle={90}
      endAngle={-270}
      cy="50%"
      labelPosition="center"
      innerRadius={innerRadius}
      outerRadius={outerRadius}
    />
  );
}
