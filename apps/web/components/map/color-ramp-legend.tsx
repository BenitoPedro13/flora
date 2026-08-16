import type { ObservationIndex, ObservationStats } from "@flora/contracts";
import { rampLegendLabels, rampStops } from "@flora/contracts";
import * as Select from "@/components/ui/select";
import * as Tooltip from "@/components/ui/tooltip";

export interface ColorRampLegendProps {
  stats: ObservationStats;
  /** Picks the ramp's stops and domain (`TASK-spectral-indices` §2.3) — omitted defaults to NDVI's. */
  index?: ObservationIndex;
}

/**
 * `16:6382` — the ramp bar plus its six labels, and the `Relative` dropdown
 * beside its lower edge (design-spec §5.3 says "beneath"; the metadata puts
 * it at x 650/y 834 against the legend's own 653–873 span — beside is what's
 * built, and the spec correction ships with this task). Disabled per §7
 * decision 1: a fixed-domain raster exists for no index yet (the deviation
 * recorded in `TASK-spectral-indices` §7 decision 1 / §10 — every shipped
 * index, including "Contrasted NDVI", is relative-domain only).
 */
export function ColorRampLegend({ stats, index }: ColorRampLegendProps) {
  const labels = rampLegendLabels(stats, index);
  const stops = rampStops(index);

  return (
    <div className="absolute left-[34px] top-[653px] flex flex-col items-start gap-3">
      <div className="flex items-stretch gap-2">
        <div
          className="h-[212px] w-[22px] rounded-full ring-1 ring-inset ring-stroke-soft-200"
          style={{ background: `linear-gradient(to top, ${stops[0]}, ${stops[1]}, ${stops[2]})` }}
        />
        <div className="flex h-[212px] flex-col justify-between py-0.5 text-label-xs text-static-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]">
          {labels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>

      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <div>
              <Select.Root variant="compact" value="relative" disabled>
                <Select.Trigger aria-label="Colour ramp mode" className="w-[87px]">
                  <Select.Value>Relative</Select.Value>
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="relative">Relative</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content side="top">
            Absolute mode needs a second raster per observation — not built yet
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  );
}
