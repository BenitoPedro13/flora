import { RiSunCloudyLine } from "@remixicon/react";
import type { FarmWeatherDay, WeatherHorizon } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Tooltip from "@/components/ui/tooltip";
import { DaySelectionStrip } from "./day-selection-strip";
import { WeatherDayCard } from "./weather-day-card";

export interface WeatherWeekCardProps {
  days: FarmWeatherDay[];
  selectedHorizon: WeatherHorizon;
  onSelectHorizon: (horizon: WeatherHorizon) => void;
}

/**
 * `24:12443`, 352×767 (§1.3) — the third `Widgets [HR Management]` instance
 * in this codebase after `TaskCard` and `RegenerationCard`. The strip picks
 * which day drives the six instrument cards (§7 decision 1); the list below
 * it always shows the whole week, one card variant for all seven days —
 * the mock's odd 5th-day variant is a drawing slip, not design (§7 decision 8).
 *
 * **The day list scrolls inside a fixed-height region, not the whole
 * card** (found live): with no cap, 8 real day cards grew this column far
 * taller than the instrument column's own 826px total (254+262+278 + two
 * 16px gaps), stretching the page height with a large empty gap under
 * Pressure/Wind Direction instead. `674px` is that 826px minus this card's
 * own fixed chrome (header 32 + strip 56 + two 16px gaps + 32px padding),
 * so the two columns end at the same height.
 */
export function WeatherWeekCard({ days, selectedHorizon, onSelectHorizon }: WeatherWeekCardProps) {
  return (
    <div className="flex w-[352px] shrink-0 flex-col gap-4 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-8 shrink-0 items-center gap-2">
        <RiSunCloudyLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">This Week</h3>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <span>
                <Button.Root variant="neutral" mode="stroke" size="xsmall" disabled>
                  See All
                </Button.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>There&apos;s no Weather detail screen yet</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      <DaySelectionStrip days={days} selectedHorizon={selectedHorizon} onSelect={onSelectHorizon} />

      <div className="flex h-[674px] flex-col gap-3 overflow-y-auto">
        {days.map((day) => (
          <WeatherDayCard
            key={day.horizon}
            day={{ date: day.date, tempC: day.tempMaxC, weatherCode: day.weatherCode }}
            isToday={day.horizon === "0"}
          />
        ))}
      </div>
    </div>
  );
}
