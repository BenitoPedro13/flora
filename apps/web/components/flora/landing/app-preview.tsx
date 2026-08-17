import type { Dashboard, Session } from "@flora/contracts";
import { formatKiloliters, formatTonnes } from "@flora/contracts";
import { RiAlertFill, RiDropFill, RiPlantFill } from "@remixicon/react";
import { AppSidebar } from "@/components/flora/app-sidebar";
import { PageHeader } from "@/components/flora/page-header";
import { PageContainer } from "@/components/flora/page-container";
import { KpiRow, KpiTile } from "@/components/flora/kpi-row";
import { CropsStockedCard } from "@/components/flora/crops-stocked-card";
import { RegenerationCard } from "@/components/flora/regeneration-card";
import { PlantingProductivityCard } from "@/components/flora/planting-productivity-card";

const previewSession: Session = {
  user: { id: "00000000-0000-0000-0000-000000000000", email: "owner@flora.local", name: "Maria Goodpart" },
  organization: { id: "00000000-0000-0000-0000-000000000000", name: "Flora Farm" },
  role: "owner",
};

/**
 * Representative sample data, shaped by `@flora/contracts`' real
 * `dashboardSchema` — not fetched, this is a public unauthenticated page.
 * Same class of thing as any marketing site's product screenshot, except
 * built from the real `components/flora/*` composites instead of a flat
 * image (TASK-landing-page — the Figma's own hero mockup showed a
 * fictional Energy dashboard that was never built; this renders what
 * actually exists).
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
    series: [
      { weekStart: "2026-02-01", currentKg: 600, previousKg: 640 },
      { weekStart: "2026-03-01", currentKg: 980, previousKg: 700 },
      { weekStart: "2026-04-01", currentKg: 720, previousKg: 900 },
      { weekStart: "2026-05-01", currentKg: 1_100, previousKg: 850 },
      { weekStart: "2026-06-01", currentKg: 860, previousKg: 950 },
      { weekStart: "2026-07-01", currentKg: 1_230, previousKg: 1_000 },
    ],
    topCrops: [
      { crop: "Corn", kg: 620, deltaPct: 9 },
      { crop: "Wheat", kg: 410, deltaPct: -3 },
    ],
  },
  pendingTasks: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      title: "Water 4 Acres of Wheat",
      description: null,
      status: "in_progress",
      activity: "watering",
      progressPct: 25,
      startsOn: "2026-09-24",
      dueOn: "2026-10-04",
      position: "a0",
      field: { id: "00000000-0000-0000-0000-000000000002", name: "Wheat 09" },
      assignees: [{ userId: "00000000-0000-0000-0000-000000000003", name: "Maria Goodpart", avatarKey: null }],
      commentCount: 2,
      subtaskCount: 5,
      subtaskDoneCount: 1,
      waterVolumeM3: 12,
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      title: "Plant 1 Acre of Wheat",
      description: null,
      status: "todo",
      activity: "planting",
      progressPct: 25,
      startsOn: "2026-09-24",
      dueOn: "2026-10-04",
      position: "a1",
      field: { id: "00000000-0000-0000-0000-000000000002", name: "Wheat 09" },
      assignees: [{ userId: "00000000-0000-0000-0000-000000000003", name: "Maria Goodpart", avatarKey: null }],
      commentCount: 0,
      subtaskCount: 2,
      subtaskDoneCount: 1,
      waterVolumeM3: null,
    },
  ],
  weather: {
    today: { date: "2026-08-17", tempC: 29, weatherCode: 0 },
    tomorrow: { date: "2026-08-18", tempC: 27, weatherCode: 3 },
  },
  meta: { day: "2026-08-16", computedAt: "2026-08-17T00:00:00.000Z" },
};

/**
 * The Hero's app-preview slot, built from real product components — see
 * `previewDashboard` above. Only the first two rows (KPIs + Crops Stocked,
 * Regeneration + Planting Productivity) render: the real Home page's own
 * third row is documented as overflowing its artboard and needing a scroll
 * (`(app)/home/page.tsx`'s own comment) — fine inside a scrollable page,
 * not inside a fixed-height decorative preview, where it just clipped
 * cards in half. Cropped cleanly at a row boundary instead.
 */
export function AppPreview() {
  const d = previewDashboard;
  return (
    <div className="flex h-[660px] w-full overflow-hidden rounded-[27px] bg-bg-white-0 shadow-[0px_1px_3px_0px_rgba(14,18,27,0.12),0px_0px_0px_1px_var(--stroke-soft-200,#e1e4ea)]">
      <AppSidebar session={previewSession} defaultCollapsed={false} />
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
        </PageContainer>
      </div>
    </div>
  );
}
