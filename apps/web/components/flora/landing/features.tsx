"use client";

import { RiRadarFill } from "@remixicon/react";
import type { FieldSummary, Task } from "@flora/contracts";
import { FieldCard } from "@/components/flora/field-card";
import { TaskCard } from "@/components/flora/task-card";
import { WeatherDayCard } from "@/components/flora/weather-day-card";
import { StressSummary } from "@/components/flora/stress-summary";

const previewField: FieldSummary = {
  id: "00000000-0000-0000-0000-000000000010",
  farmId: "00000000-0000-0000-0000-000000000000",
  name: "1",
  areaM2: 1_794_010,
  centroid: { type: "Point", coordinates: [-48.6035, -15.9469] },
  position: 1,
  lastRefreshSucceededAt: "2026-08-16T22:02:19.532Z",
  lastRefreshError: null,
  cropCycle: {
    id: "00000000-0000-0000-0000-000000000011",
    cropId: "00000000-0000-0000-0000-000000000012",
    cropName: "Corn",
    plantedOn: "2026-08-07",
    expectedHarvestOn: "2026-08-31",
    status: "growing",
    quantityKg: 100_000,
    growthPct: 42,
  },
  activities: ["pest_control"],
};

const previewTask: Task = {
  id: "00000000-0000-0000-0000-000000000020",
  title: "Water 4 Acres of Wheat",
  description: null,
  status: "in_progress",
  activity: "watering",
  progressPct: 25,
  startsOn: "2026-09-24",
  dueOn: "2026-10-04",
  position: "a0",
  field: { id: "00000000-0000-0000-0000-000000000010", name: "Wheat 09" },
  assignees: [{ userId: "00000000-0000-0000-0000-000000000021", name: "Maria Goodpart", avatarKey: null }],
  commentCount: 2,
  subtaskCount: 5,
  subtaskDoneCount: 1,
  waterVolumeM3: 12,
};

const previewWeatherDay = { date: "2026-08-17", tempC: 29, weatherCode: 0 };

type Feature = {
  eyebrow: string;
  title: string;
  body: string;
  visual: React.ReactNode;
};

const features: Feature[] = [
  {
    eyebrow: "Fields & Crops",
    title: "Register a crop, watch it through the season",
    body: "Draw a field boundary once, track every crop cycle against it, and see growth, planted date, and expected harvest update as the season runs — no spreadsheet in the loop.",
    visual: (
      <FieldCard field={previewField} selected={false} onSelect={() => {}} onViewDetails={() => {}} />
    ),
  },
  {
    eyebrow: "Crop Stress",
    title: "Ten spectral indices, not a guess",
    body: "Sentinel-2 satellite imagery, processed into NDVI, NDRE, NDMI, EVI and more — clipped to each field's real boundary, rendered as a colour-ramped overlay with stress zones detected automatically.",
    visual: (
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
        <div className="flex items-center gap-2 text-text-sub-600">
          <RiRadarFill className="size-[18px]" />
          <span className="text-label-sm">Field 237 — NDVI</span>
        </div>
        <StressSummary
          count={3}
          totalAreaM2={42_000}
          showMuted={false}
          onToggleShowMuted={() => {}}
          onRefresh={() => {}}
          refreshDisabled
        />
      </div>
    ),
  },
  {
    eyebrow: "Tasks",
    title: "Work that's tied back to the field",
    body: "A drag-and-drop board where every task carries the field, the crop cycle, and the activity it belongs to — watering, planting, harvesting — not a generic to-do list.",
    visual: <TaskCard task={previewTask} compact />,
  },
  {
    eyebrow: "Weather",
    title: "A 7-day forecast against real published scales",
    body: "Wind, UV, rain probability, pressure, and sun position — sourced from Open-Meteo and graded against WHO/WMO and NOAA/NWS's own bands, not an invented scale.",
    visual: <WeatherDayCard day={previewWeatherDay} isToday />,
  },
];

/**
 * `2180:4419` in the landing Figma, rebuilt rather than ported
 * (TASK-landing-page §5.1): the design's body copy is the same lorem-ipsum
 * sentence repeated across all four tabs, and its fourth tab is the
 * fictional Energy dashboard the Hero also had to route around. Real copy
 * about Flora's four real capabilities instead, each with an actual
 * `components/flora/*` composite as its visual — same "use our components,
 * not images" call as the Hero's `AppPreview`.
 */
export function Features() {
  return (
    <section id="features" className="mx-auto max-w-[1200px] px-8 py-24">
      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <span className="rounded-full bg-primary-alpha-10 px-3 py-1 text-label-sm text-primary-base">
          Features
        </span>
        <h2 className="max-w-[600px] text-title-h2 text-text-strong-950">
          Manage your farm, one real screen at a time
        </h2>
      </div>

      <div className="flex flex-col gap-6">
        {features.map((feature) => (
          <div
            key={feature.eyebrow}
            className="flex flex-col items-center gap-8 rounded-2xl border border-stroke-soft-200 bg-bg-weak-50 p-8 md:flex-row"
          >
            <div className="flex flex-1 flex-col gap-3">
              <span className="text-label-sm text-primary-base">{feature.eyebrow}</span>
              <h3 className="text-title-h4 text-text-strong-950">{feature.title}</h3>
              <p className="text-paragraph-md text-text-sub-600">{feature.body}</p>
            </div>
            <div className="flex w-full max-w-[340px] shrink-0 items-center justify-center">
              {feature.visual}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
