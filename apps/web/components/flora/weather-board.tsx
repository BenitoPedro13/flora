"use client";

import * as React from "react";
import { RiShowersLine, RiSpeedLine, RiSunLine, RiWindyFill } from "@remixicon/react";
import type { FarmWeatherDay } from "@flora/contracts";
import { RadialGauge } from "@/components/charts/arc-gauge";
import { PressureDial } from "@/components/charts/pressure-dial";
import { formatTime as formatSunTime, SunArc } from "@/components/charts/sun-arc";
import { UvTrack } from "@/components/charts/uv-track";
import { WindBars } from "@/components/charts/wind-bars";
import { WindCompass } from "@/components/charts/wind-compass";
import { InstrumentCard } from "./instrument-card";
import { WeatherWeekCard } from "./weather-week-card";

export interface WeatherBoardProps {
  days: FarmWeatherDay[];
}

/** WHO/WMO/UNEP/ICNIRP, *Global Solar UV Index: A Practical Guide* — continuous boundaries, not integer buckets (§7 decision 3, CHANGED under research). */
const UV_BANDS = [
  { max: 3, label: "Low" },
  { max: 6, label: "Moderate" },
  { max: 8, label: "High" },
  { max: 11, label: "Very high" },
  { max: Infinity, label: "Extreme" },
];

function uvBandLabel(uv: number): string {
  return UV_BANDS.find((b) => uv < b.max)?.label ?? "Extreme";
}

/** NOAA/NWS *Forecast Terms* PoP terminology, thresholds verbatim, labels shortened to fit the ring (§7 decision 4, CHANGED under research — a published scale, not an invented one). */
function rainBandLabel(pct: number): string {
  if (pct < 20) return "None";
  if (pct < 30) return "Slight";
  if (pct < 60) return "Chance";
  if (pct < 80) return "Likely";
  return "Very likely";
}

/** Open-Meteo's local-time ISO strings have no zone suffix — a plain string split, not a Date parse. */
function formatHourLabel(iso: string): string {
  const time = iso.split("T")[1] ?? "";
  const [h] = time.split(":").map(Number);
  if (h === undefined) return "—";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/**
 * Current hour of the given date, in the browser's own local clock — an
 * approximation, same caveat as `SunArc`: no farm-local live clock exists
 * anywhere in the product yet (out of scope, task doc §5).
 */
function currentHourIsoOf(date: string): string {
  const now = new Date();
  return `${date}T${String(now.getHours()).padStart(2, "0")}:00`;
}

/**
 * `"use client"` — owns `selectedHorizon` (§2.6, architecture §9.2: server
 * fetches once, a client island holds interaction state). All 8 days arrive
 * as props; selecting a day in the strip is local state, never a refetch —
 * ~30KB of JSON the browser already has.
 */
export function WeatherBoard({ days }: WeatherBoardProps) {
  const [selectedHorizon, setSelectedHorizon] = React.useState(days[0]?.horizon ?? "0");
  const selected = days.find((d) => d.horizon === selectedHorizon) ?? days[0];

  if (!selected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-label-md text-text-strong-950">No forecast yet</p>
        <p className="text-paragraph-sm text-text-sub-600">The ingest job hasn&apos;t run for this farm.</p>
      </div>
    );
  }

  const isToday = selected.horizon === "0";
  const hours = selected.hours;
  const currentHourIso = isToday ? currentHourIsoOf(selected.date) : undefined;
  const currentHour = currentHourIso ? hours.find((h) => h.time === currentHourIso) : undefined;

  const windSpeed = currentHour?.windSpeedKmh ?? selected.windSpeedMaxKmh;
  const windDirection = currentHour?.windDirectionDeg ?? selected.windDirectionDeg;
  const uv = currentHour?.uvIndex ?? selected.uvIndexMax ?? 0;
  const pressure = currentHour?.pressureMslHpa;
  const rainPct = selected.precipProbabilityPct ?? 0;
  const metaLabel = currentHourIso ? formatHourLabel(currentHourIso) : weekdayLabel(selected.date);

  return (
    // Two independent layout pieces, not one CSS grid with a row-spanning
    // cell: found live — a `row-span-3` week card whose real content
    // (header + strip + 7 day cards) is far taller than the 3 instrument
    // rows combined forces CSS Grid to stretch those rows to match, leaving
    // a large empty gap under each fixed-height instrument card instead of
    // the intended `gap-y-4`. A flex row of [week card, flex column of 3
    // instrument-pair rows] makes the two columns' heights independent.
    <div className="flex items-start gap-[27px] pb-6">
      <WeatherWeekCard days={days} selectedHorizon={selectedHorizon} onSelectHorizon={setSelectedHorizon} />
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex gap-[27px]">
          <InstrumentCard
            icon={RiWindyFill}
            title="Wind Status"
            className="h-[254px]"
            footerValue={`${Math.round(windSpeed)} Km/h`}
            footerMeta={metaLabel}
          >
            <WindBars hours={hours} highlightTime={currentHourIso} className="h-[130px] w-full" />
          </InstrumentCard>

          <InstrumentCard
            icon={RiSunLine}
            title="UV Index"
            className="h-[254px]"
            footerValue={uv.toFixed(1)}
            footerMeta={metaLabel}
          >
            <div className="flex h-[130px] w-full flex-col justify-end gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-title-h4 text-text-strong-950">{uv.toFixed(1)}</span>
                <span className="text-label-sm text-text-sub-600">{uvBandLabel(uv)}</span>
              </div>
              <UvTrack uvIndex={uv} />
            </div>
          </InstrumentCard>
        </div>

        <div className="flex gap-[27px]">
          <InstrumentCard
            icon={RiShowersLine}
            title="Rain Chance"
            className="h-[262px]"
            footerValue={`${Math.round(rainPct)}%`}
            footerMeta={rainBandLabel(rainPct)}
          >
            <RadialGauge
              value={rainPct}
              max={100}
              label=""
              valueLabel={rainBandLabel(rainPct)}
              trackColor="var(--color-bg-weak-50)"
              fillColor="var(--color-blue-300)"
              className="h-[132px] w-[132px]"
            />
          </InstrumentCard>

          <InstrumentCard
            icon={RiSunLine}
            title="Sunrise & Sunset"
            className="h-[262px]"
            footerValue={selected.sunrise ? formatSunTime(selected.sunrise) : "—"}
            footerMeta={selected.sunset ? formatSunTime(selected.sunset) : "—"}
          >
            <SunArc sunrise={selected.sunrise} sunset={selected.sunset} isToday={isToday} className="h-[139px] w-full" />
          </InstrumentCard>
        </div>

        <div className="flex gap-[27px]">
          <InstrumentCard
            icon={RiSpeedLine}
            title="Pressure"
            className="h-[278px]"
            footerValue={pressure !== undefined ? `${Math.round(pressure)} hpa` : "—"}
            footerMeta={metaLabel}
          >
            <PressureDial hpa={pressure} className="h-[136px] w-[144px]" />
          </InstrumentCard>

          <InstrumentCard
            icon={RiWindyFill}
            title="Wind Direction"
            className="h-[278px]"
            footerValue={windDirection !== undefined ? `${Math.round(windDirection)}°` : "—"}
            footerMeta={`${Math.round(windSpeed)} km/h`}
          >
            <WindCompass directionDeg={windDirection} speedKmh={windSpeed} className="h-[150px] w-[150px]" />
          </InstrumentCard>
        </div>
      </div>
    </div>
  );
}
