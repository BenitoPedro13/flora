import { RiSunCloudyLine } from "@remixicon/react";
import type { DashboardWeather } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Tooltip from "@/components/ui/tooltip";
import { WeatherDayCard } from "./weather-day-card";

/** §1.3: 400×384, two stacked `WeatherDayCard`s. The 7-day forecast is ingested (§2.6) but stays Phase 5 — Home reads only today/tomorrow. */
export function WeatherCard({ weather }: { weather: DashboardWeather }) {
  return (
    <div className="flex w-[400px] shrink-0 flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-7 items-center gap-2">
        <RiSunCloudyLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Weather</h3>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <span>
                <Button.Root variant="neutral" mode="stroke" size="xsmall" disabled>
                  Details
                </Button.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>The 7-day Weather screen is Phase 5</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {weather.today ? (
          <WeatherDayCard day={weather.today} isToday />
        ) : (
          <p className="text-paragraph-xs text-text-soft-400">No forecast yet — the ingest job hasn't run for this farm.</p>
        )}
        {weather.tomorrow ? <WeatherDayCard day={weather.tomorrow} isToday={false} /> : null}
      </div>
    </div>
  );
}
