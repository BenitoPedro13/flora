import {
  RiDrizzleLine,
  RiFoggyLine,
  RiRainyLine,
  RiSnowyLine,
  RiSunCloudyLine,
  RiSunLine,
  RiThunderstormsLine,
} from "@remixicon/react";
import type { WeatherDay } from "@flora/contracts";

/** Open-Meteo's WMO weather codes, grouped to the nearest Remix weather glyph. */
function weatherIcon(code: number) {
  if (code === 0) return RiSunLine;
  if (code <= 3) return RiSunCloudyLine;
  if (code <= 48) return RiFoggyLine;
  if (code <= 57) return RiDrizzleLine;
  if (code <= 67 || (code >= 80 && code <= 82)) return RiRainyLine;
  if (code <= 77) return RiSnowyLine;
  return RiThunderstormsLine;
}

function dayName(iso: string, today: boolean): string {
  return today ? "Today" : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The rebuilt `Schedule Cards [Schedule] [1.0]` PRO block (design-spec §6.2) — 368×143, a `bg-weak-50` surface (§1.3). */
export function WeatherDayCard({ day, isToday }: { day: WeatherDay; isToday: boolean }) {
  // This component renders both server-side (Home's WeatherCard) and inside
  // a client subtree (Weather's WeatherWeekCard) — a hook here would break
  // the server-rendered call site. `weatherIcon` picks among a fixed set of
  // module-level Remix icon components; it isn't creating a new component
  // per render, just selecting one, which the lint rule can't tell apart.
  const Icon = weatherIcon(day.weatherCode);
  return (
    <div className="flex h-[143px] items-center gap-4 rounded-2xl bg-bg-weak-50 p-4">
      {/* eslint-disable-next-line react-hooks/static-components -- see comment above */}
      <Icon className="size-16 shrink-0 text-primary-base" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col items-end gap-2 text-right">
        <span className="w-full truncate text-label-lg text-text-strong-950">{dayName(day.date, isToday)}</span>
        <span className="text-title-h5 text-text-strong-950">{Math.round(day.tempC)}ºC</span>
        <span className="text-paragraph-xs text-text-sub-600">{shortDate(day.date)}</span>
      </div>
    </div>
  );
}
