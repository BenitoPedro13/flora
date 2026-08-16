import type { ChartConfig } from "@/components/ui/chart";

/**
 * Shared shadcn/Recharts theming (design-spec §7.3). The only file besides
 * `app/globals.css` permitted to hold a raw colour value (invariant 7) — the
 * dark tooltip is deliberately independent of the light/dark theme tokens
 * (design-spec §8: "the only place a dark surface appears").
 */

export const chartSeriesColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const chartGridStroke = "var(--color-stroke-soft-200)";

export const chartAxisLabelClassName = "text-paragraph-xs text-text-soft-400";

export const chartTooltipStyle = {
  background: "var(--color-bg-strong-950)",
  color: "var(--color-static-white)",
} as const;

/** Builds a `ChartConfig` mapping series keys to the shared green ramp, in order. */
export function chartConfigFromKeys(
  keys: readonly string[],
  labels?: Partial<Record<string, string>>,
): ChartConfig {
  return Object.fromEntries(
    keys.map((key, index) => [
      key,
      {
        label: labels?.[key] ?? key,
        color: chartSeriesColors[index % chartSeriesColors.length],
      },
    ]),
  );
}
