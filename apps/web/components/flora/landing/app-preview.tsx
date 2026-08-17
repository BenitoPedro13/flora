"use client";

import * as React from "react";
import type { BBox, Dashboard, FieldFeatureCollection, FieldSummary, ObservationStats, Session, Task, TaskStatus } from "@flora/contracts";
import { formatKiloliters, formatTonnes, rampLegendLabels, rampStops } from "@flora/contracts";
import { RiAlertFill, RiDropFill, RiPlantFill, RiSunLine, RiWindyFill } from "@remixicon/react";
import { AppSidebar } from "@/components/flora/app-sidebar";
import { PageHeader } from "@/components/flora/page-header";
import { PageContainer } from "@/components/flora/page-container";
import { KpiRow, KpiTile } from "@/components/flora/kpi-row";
import { CropsStockedCard } from "@/components/flora/crops-stocked-card";
import { RegenerationCard } from "@/components/flora/regeneration-card";
import { PlantingProductivityCard } from "@/components/flora/planting-productivity-card";
import { FieldCard } from "@/components/flora/field-card";
import { KanbanBoard, type KanbanBoardColumn } from "@/components/flora/kanban-board";
import { WeatherCard } from "@/components/flora/weather-card";
import { WeatherDayCard } from "@/components/flora/weather-day-card";
import { InstrumentCard } from "@/components/flora/instrument-card";
import { FieldMap } from "@/components/map/field-map";
import { RasterOverlay } from "@/components/map/raster-overlay";

const previewSession: Session = {
  user: { id: "00000000-0000-0000-0000-000000000000", email: "owner@flora.local", name: "Maria Goodpart" },
  organization: { id: "00000000-0000-0000-0000-000000000000", name: "Flora Farm" },
  role: "owner",
};

/**
 * Representative sample data, shaped by `@flora/contracts`' real schemas —
 * not fetched, this is a public unauthenticated page. Same class of thing
 * as any marketing site's product screenshot, except built from the real
 * `components/flora/*` composites instead of a flat image (TASK-landing-page
 * — the Figma's own hero mockup showed a fictional Energy dashboard that
 * was never built; this renders what actually exists).
 */
const previewDashboard: Dashboard = {
  kpis: {
    cropsStockedKg: { value: 277_000, deltaPct: 14 },
    fieldsAtRisk: { value: 2, deltaPct: -8 },
    waterUsedM3: { value: 22_000, deltaPct: 14 },
  },
  cropsStocked: {
    totalKg: 277_000,
    byCrop: [
      { crop: "Corn", kg: 96_950, sharePct: 35 },
      { crop: "Wheat", kg: 77_560, sharePct: 28 },
      { crop: "Soy", kg: 69_250, sharePct: 25 },
      { crop: "Rice", kg: 33_240, sharePct: 12 },
    ],
  },
  regeneration: {
    current: {
      score: 95,
      class: "desired",
      formulaVersion: "aafc-v1",
      components: [
        { key: "soilCover", weight: 0.34, value: 96, present: true },
        { key: "cropDiversity", weight: 0.33, value: 91, present: true },
        { key: "vegetationHealth", weight: 0.33, value: 97, present: true },
      ],
    },
    previous: { score: 86, class: "good", computedOn: "2026-08-16" },
  },
  plantingProductivity: [
    { month: "2025-09-01", byCrop: [{ crop: "Corn", sharePct: 62 }, { crop: "Wheat", sharePct: 38 }] },
    { month: "2025-10-01", byCrop: [{ crop: "Corn", sharePct: 78 }, { crop: "Wheat", sharePct: 22 }] },
    { month: "2025-11-01", byCrop: [{ crop: "Corn", sharePct: 74 }, { crop: "Soy", sharePct: 26 }] },
    { month: "2025-12-01", byCrop: [{ crop: "Wheat", sharePct: 55 }, { crop: "Soy", sharePct: 45 }] },
    { month: "2026-01-01", byCrop: [{ crop: "Soy", sharePct: 68 }, { crop: "Rice", sharePct: 32 }] },
    { month: "2026-02-01", byCrop: [{ crop: "Corn", sharePct: 30 }, { crop: "Soy", sharePct: 70 }] },
    { month: "2026-03-01", byCrop: [{ crop: "Wheat", sharePct: 76 }, { crop: "Rice", sharePct: 24 }] },
    { month: "2026-04-01", byCrop: [{ crop: "Corn", sharePct: 71 }, { crop: "Wheat", sharePct: 29 }] },
    { month: "2026-05-01", byCrop: [{ crop: "Soy", sharePct: 58 }, { crop: "Rice", sharePct: 42 }] },
    { month: "2026-06-01", byCrop: [{ crop: "Corn", sharePct: 83 }, { crop: "Soy", sharePct: 17 }] },
    { month: "2026-07-01", byCrop: [{ crop: "Wheat", sharePct: 64 }, { crop: "Corn", sharePct: 36 }] },
    { month: "2026-08-01", byCrop: [{ crop: "Corn", sharePct: 55 }, { crop: "Wheat", sharePct: 45 }] },
  ],
  gatheringRate: {
    ratePerDayKg: 1_230,
    deltaPct: -0.4,
    series: [],
    topCrops: [
      { crop: "Corn", kg: 620, deltaPct: 9 },
      { crop: "Wheat", kg: 410, deltaPct: -3 },
    ],
  },
  pendingTasks: [],
  weather: {
    today: { date: "2026-08-17", tempC: 29, weatherCode: 0 },
    tomorrow: { date: "2026-08-18", tempC: 27, weatherCode: 3 },
  },
  meta: { day: "2026-08-16", computedAt: "2026-08-17T00:00:00.000Z" },
};

const previewFields: FieldSummary[] = [
  {
    id: "dfe33d39-7808-49b2-b789-002e1306e732",
    farmId: "ad79d2cd-c8e8-4d3f-97e9-318b1045c98d",
    name: "1",
    areaM2: 1_794_011,
    centroid: { type: "Point", coordinates: [-48.603500752, -15.946936904] },
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
  },
  {
    id: "bbba7288-b598-4e8e-80df-ad48f7170b74",
    farmId: "ad79d2cd-c8e8-4d3f-97e9-318b1045c98d",
    name: "2",
    areaM2: 2_384_671,
    centroid: { type: "Point", coordinates: [-48.602156629, -15.957344443] },
    position: 2,
    lastRefreshSucceededAt: "2026-08-16T22:02:21.823Z",
    lastRefreshError: null,
    cropCycle: {
      id: "00000000-0000-0000-0000-000000000014",
      cropId: "00000000-0000-0000-0000-000000000015",
      cropName: "Soy",
      plantedOn: "2026-08-01",
      expectedHarvestOn: "2026-08-31",
      status: "growing",
      quantityKg: 100_000,
      growthPct: 53,
    },
    activities: ["harvesting"],
  },
];

/**
 * Field "1"'s real boundary, `bbox`, and NDVI `stats` — read straight out of
 * the seeded local database (`fields`/`observations`, `captured_on
 * 2026-08-14`, `scene_id S2B_MSIL2A_20260814T133149_N0512_R081_T22LGH_
 * 20260814T171021.SAFE`), the same row `/landing/ndvi-sample.png` was
 * exported from. Not a hand-drawn shape or invented stats — this is what
 * `<FieldMap>`/`<RasterOverlay>` render for this field in the real app.
 */
const previewFieldBoundary: FieldFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-48.610348884, -15.940852003],
              [-48.611222141, -15.943538952],
              [-48.609475626, -15.948576883],
              [-48.603886779, -15.952271285],
              [-48.603362824, -15.95546185],
              [-48.594106295, -15.949752382],
              [-48.602314915, -15.939508516],
              [-48.610348884, -15.940852003],
            ],
          ],
        ],
      },
      properties: {
        id: previewFields[0]!.id,
        name: previewFields[0]!.name,
        centroid: previewFields[0]!.centroid,
        areaM2: previewFields[0]!.areaM2,
      },
    },
  ],
};

const previewRasterBbox: BBox = [-48.611222141, -15.95546185, -48.594106295, -15.939508516];

const previewObservationStats: ObservationStats = {
  min: 0.12289485335350037,
  max: 0.8722786903381348,
  mean: 0.27979685114081987,
  stddev: 0.09855751658905228,
  p10: 0.22450490295886993,
  p90: 0.31453272700309753,
};

const previewRampStops = rampStops();
const previewRampLabels = rampLegendLabels(previewObservationStats);

const previewTasks: Record<"todo" | "in_progress" | "done", Task[]> = {
  todo: [
    {
      id: "00000000-0000-0000-0000-000000000020",
      title: "Plant 1 Acre of Wheat",
      description: null,
      status: "todo",
      activity: "planting",
      progressPct: 0,
      startsOn: "2026-09-24",
      dueOn: "2026-10-04",
      position: "a0",
      field: { id: "dfe33d39-7808-49b2-b789-002e1306e732", name: "Field 1" },
      assignees: [{ userId: "00000000-0000-0000-0000-000000000021", name: "Maria Goodpart", avatarKey: null }],
      commentCount: 0,
      subtaskCount: 2,
      subtaskDoneCount: 0,
      waterVolumeM3: null,
    },
  ],
  in_progress: [
    {
      id: "00000000-0000-0000-0000-000000000022",
      title: "Water 4 Acres of Wheat",
      description: null,
      status: "in_progress",
      activity: "watering",
      progressPct: 25,
      startsOn: "2026-09-24",
      dueOn: "2026-10-04",
      position: "a1",
      field: { id: "dfe33d39-7808-49b2-b789-002e1306e732", name: "Field 1" },
      assignees: [{ userId: "00000000-0000-0000-0000-000000000021", name: "Maria Goodpart", avatarKey: null }],
      commentCount: 2,
      subtaskCount: 5,
      subtaskDoneCount: 1,
      waterVolumeM3: 12,
    },
  ],
  done: [
    {
      id: "00000000-0000-0000-0000-000000000023",
      title: "Fertilize Field 237",
      description: null,
      status: "done",
      activity: "fertilization",
      progressPct: 100,
      startsOn: "2026-09-10",
      dueOn: "2026-09-12",
      position: "a2",
      field: { id: "bbba7288-b598-4e8e-80df-ad48f7170b74", name: "Field 2" },
      assignees: [{ userId: "00000000-0000-0000-0000-000000000021", name: "Maria Goodpart", avatarKey: null }],
      commentCount: 1,
      subtaskCount: 3,
      subtaskDoneCount: 3,
      waterVolumeM3: null,
    },
  ],
};

const previewTaskColumns: KanbanBoardColumn[] = [
  { status: "todo", tasks: previewTasks.todo },
  { status: "in_progress", tasks: previewTasks.in_progress },
  { status: "done", tasks: previewTasks.done },
];

const tabs = [
  { key: "home", label: "Home" },
  { key: "fields", label: "Fields" },
  { key: "tasks", label: "Tasks" },
  { key: "weather", label: "Weather" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

function HomeBody() {
  const d = previewDashboard;
  return (
    <>
      <KpiRow>
        <KpiTile
          icon={RiPlantFill}
          label="Crops Stocked"
          value={formatTonnes(d.kpis.cropsStockedKg.value)}
          deltaPct={d.kpis.cropsStockedKg.deltaPct}
          tooltip="Harvested, trailing 12 months"
        />
        <KpiTile
          icon={RiAlertFill}
          label="Fields at Risk"
          value={String(d.kpis.fieldsAtRisk.value)}
          deltaPct={d.kpis.fieldsAtRisk.deltaPct}
          tooltip="Fields with an unmuted stress zone"
        />
        <KpiTile
          icon={RiDropFill}
          label="Water Used"
          value={formatKiloliters(d.kpis.waterUsedM3.value)}
          deltaPct={d.kpis.waterUsedM3.deltaPct}
          tooltip="Trailing 30 days"
        />
        <CropsStockedCard cropsStocked={d.cropsStocked} />
      </KpiRow>
      <div className="flex flex-wrap items-start gap-4">
        <RegenerationCard regeneration={d.regeneration} />
        <PlantingProductivityCard months={d.plantingProductivity} />
      </div>
    </>
  );
}

function FieldsBody() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      <div className="flex w-[340px] shrink-0 flex-col gap-4 overflow-hidden">
        {previewFields.map((field) => (
          <FieldCard key={field.id} field={field} selected={field.id === previewFields[0]!.id} onSelect={() => {}} onViewDetails={() => {}} />
        ))}
      </div>
      {/* The real `FieldMap`/`RasterOverlay` composites, not a static crop —
          Field 1's real boundary over the real satellite basemap, with its
          real 2026-08-14 NDVI raster layered on top (same components
          `/fields/[fieldId]/stress` renders). No editing hooks are provided
          here, so the preview can show the real map without allowing edits. */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-stroke-soft-200 bg-bg-weak-50">
        <FieldMap features={previewFieldBoundary} selectedFieldId={previewFields[0]!.id} onSelectField={() => {}}>
          <RasterOverlay rasterUrl="/landing/ndvi-sample.png" bbox={previewRasterBbox} />
        </FieldMap>
        <div className="absolute bottom-3 left-3 flex items-stretch gap-2 rounded-lg bg-bg-white-0/90 p-2 backdrop-blur-sm">
          <div
            className="h-[110px] w-2.5 shrink-0 rounded-full"
            style={{ background: `linear-gradient(to top, ${previewRampStops[0]}, ${previewRampStops[1]}, ${previewRampStops[2]})` }}
          />
          <div className="flex h-[110px] flex-col justify-between text-label-xs text-text-sub-600">
            {previewRampLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
        <div className="absolute bottom-3 right-3 rounded-lg bg-bg-white-0/90 px-2.5 py-1 text-label-xs text-text-sub-600 backdrop-blur-sm">
          NDVI — Field 1, Aug 14
        </div>
      </div>
    </div>
  );
}

function TasksBody() {
  const [columns, setColumns] = React.useState<KanbanBoardColumn[]>(() =>
    previewTaskColumns.map((column) => ({ ...column, tasks: [...column.tasks] })),
  );

  const handleMove = React.useCallback(
    (_taskId: string, _input: { status: TaskStatus; beforeId: string | null; afterId: string | null }, optimisticColumns: KanbanBoardColumn[]) => {
      setColumns(optimisticColumns);
    },
    [],
  );

  return <KanbanBoard columns={columns} onTaskClick={() => {}} onAddTask={() => {}} onMove={handleMove} />;
}

function WeatherBody() {
  return (
    <div className="flex flex-1 flex-wrap items-start gap-4 overflow-hidden">
      <WeatherCard weather={previewDashboard.weather} />
      <InstrumentCard icon={RiWindyFill} title="Wind" footerValue="12 km/h" footerMeta="ENE">
        <div className="flex size-28 items-center justify-center rounded-full border border-stroke-soft-200 bg-bg-weak-50 text-title-h5 text-text-strong-950">
          12
        </div>
      </InstrumentCard>
      <InstrumentCard icon={RiSunLine} title="UV Index" footerValue="Moderate" footerMeta="Updated now">
        <div className="flex flex-col items-center gap-2">
          <span className="text-title-h3 text-text-strong-950">5</span>
          <div className="h-2 w-40 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" />
        </div>
      </InstrumentCard>
      <WeatherDayCard day={{ date: "2026-08-19", tempC: 26, weatherCode: 61 }} isToday={false} />
      <WeatherDayCard day={{ date: "2026-08-20", tempC: 30, weatherCode: 1 }} isToday={false} />
    </div>
  );
}

/**
 * The Hero's app-preview slot, built from real product components. Tabbed
 * (TASK-landing-page — the nav strip above it used to be static labels;
 * user's call was to make it real, switching between mocked Home/Fields/
 * Tasks/Weather screens, matching the Figma's original "Hero Slider"
 * intent). Only Home's second row (Regeneration + Planting Productivity)
 * and no third row render for Home specifically — the real Home page's own
 * third row is documented as overflowing its artboard and needing a
 * scroll, fine inside a scrollable page, not inside a fixed-height
 * decorative preview.
 */
export function AppPreview() {
  const [tab, setTab] = React.useState<TabKey>("home");

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex items-center gap-6 rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4 text-label-sm text-text-sub-600">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              t.key === tab
                ? "rounded-lg bg-bg-weak-50 px-2 py-1 text-text-strong-950"
                : "px-2 py-1 hover:text-text-strong-950"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="w-full rounded-[37px] border border-stroke-soft-200 bg-[rgba(253,242,222,0.39)] p-3.5 backdrop-blur-md">
        <div
          // Decorative only — real navigation out of a marketing page into
          // the real (session-gated) app was confusing, not a feature
          // ("the sidenav of the preview puts me on the real app").
          // `AppSidebar`'s nav items are real `<Link>`s with real hrefs;
          // this is the whole-block way to neutralise them without a
          // preview-only fork of the component.
          className="flex h-[660px] w-full overflow-hidden rounded-[27px] bg-bg-white-0 shadow-[0px_1px_3px_0px_rgba(14,18,27,0.12),0px_0px_0px_1px_var(--stroke-soft-200,#e1e4ea)]"
        >
          <div className="pointer-events-none flex shrink-0">
            <AppSidebar session={previewSession} defaultCollapsed />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <PageHeader
              leading={
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-base text-label-lg text-static-white">
                  M
                </div>
              }
              title="Maria Goodpart"
              subtitle="Welcome back to Flora™ 👋"
            />
            <PageContainer className="flex flex-1 flex-col gap-4 overflow-hidden py-6">
              {tab === "home" ? <HomeBody /> : null}
              {tab === "fields" ? <FieldsBody /> : null}
              {tab === "tasks" ? <TasksBody /> : null}
              {tab === "weather" ? <WeatherBody /> : null}
            </PageContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
