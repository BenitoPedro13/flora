import { redirect } from "next/navigation";
import { z } from "zod";
import {
  dashboardSchema,
  farmSchema,
  fieldSummarySchema,
  formatKiloliters,
  formatTonnes,
  pageSchema,
} from "@flora/contracts";
import { RiAlertFill, RiDropFill, RiPlantFill, RiSearchLine, RiNotification3Line } from "@remixicon/react";
import { getSession } from "@/lib/session";
import { apiFetchServer } from "@/lib/api-client.server";
import * as CompactButton from "@/components/ui/compact-button";
import * as Tooltip from "@/components/ui/tooltip";
import { PageContainer } from "@/components/flora/page-container";
import { PageHeader } from "@/components/flora/page-header";
import { CreateTaskButton } from "@/components/flora/create-task-button";
import { KpiRow, KpiTile } from "@/components/flora/kpi-row";
import { CropsStockedCard } from "@/components/flora/crops-stocked-card";
import { RegenerationCard } from "@/components/flora/regeneration-card";
import { PlantingProductivityCard } from "@/components/flora/planting-productivity-card";
import { WeatherCard } from "@/components/flora/weather-card";
import { GatheringRateCard } from "@/components/flora/gathering-rate-card";
import { PendingTasksCard } from "@/components/flora/pending-tasks-card";
import { createPageMetadata } from "@/lib/seo/metadata";

export const metadata = createPageMetadata({
  title: "Home",
  description: "Farm dashboard with crop KPIs, regeneration score, productivity, weather, and pending tasks.",
  path: "/home",
  ogImageAlt: "Flora home dashboard",
});

/**
 * Home (`1:12913`, TASK-home-dashboard §2.13) — the first screen that reads
 * across every domain rather than owning one. Only the four charts and the
 * `+ Create Task` trigger are Client Components (architecture §9.2); this
 * page, the header and every card are Server Components fetching once.
 *
 * Row 3 overflows the 900px artboard (613 + 396 = 1009) and the three cards
 * keep unequal, top-aligned heights — both are measured facts of `1:12913`
 * (§1.3 notes 1–2), not layout bugs, and both are exactly what the board
 * screen got wrong the first time (`TASK-tasks-board` §10).
 */
export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [farms, fieldsPage] = await Promise.all([
    apiFetchServer("/api/v1/farms", z.array(farmSchema)),
    apiFetchServer("/api/v1/fields?sort=position&limit=100", pageSchema(fieldSummarySchema)),
  ]);

  const displayName = session.user.name ?? session.user.email;
  const initial = displayName.slice(0, 1).toUpperCase();

  const headerActions = (
    <>
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <span>
              <CompactButton.Root variant="ghost" size="large" disabled>
                <CompactButton.Icon as={RiSearchLine} />
              </CompactButton.Root>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>Search isn&apos;t built yet</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <span>
              <CompactButton.Root variant="ghost" size="large" disabled>
                <CompactButton.Icon as={RiNotification3Line} />
              </CompactButton.Root>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>Notifications aren&apos;t built yet</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
      <CreateTaskButton fields={fieldsPage.items} />
    </>
  );

  if (farms.length === 0) {
    return (
      <>
        <PageHeader title={displayName} subtitle="Welcome back to Flora™ 👋" actions={headerActions} />
        <PageContainer className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="text-label-md text-text-strong-950">No farm yet</p>
          <p className="text-paragraph-sm text-text-sub-600">Add a farm to see your dashboard here.</p>
        </PageContainer>
      </>
    );
  }

  // Multi-farm orgs get the first farm by name (§7 decision 9) — the design
  // has no farm switcher and every seeded org has exactly one.
  const farm = farms[0]!;
  const dashboard = await apiFetchServer(`/api/v1/farms/${farm.id}/dashboard`, dashboardSchema);
  const asOfTooltip = `As of ${dashboard.meta.day}, vs. 7 days earlier`;

  return (
    <>
      <PageHeader
        leading={
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-base text-label-lg text-static-white">
            {initial}
          </div>
        }
        title={displayName}
        subtitle="Welcome back to Flora™ 👋"
        actions={headerActions}
      />

      <PageContainer className="flex flex-1 flex-col gap-4 overflow-y-auto py-6">
        <KpiRow>
          <KpiTile
            icon={RiPlantFill}
            label="Crops Stocked"
            value={formatTonnes(dashboard.kpis.cropsStockedKg.value)}
            deltaPct={dashboard.kpis.cropsStockedKg.deltaPct}
            tooltip={`Harvested, trailing 12 months. ${asOfTooltip}`}
          />
          <KpiTile
            icon={RiAlertFill}
            label="Fields at Risk"
            value={String(dashboard.kpis.fieldsAtRisk.value)}
            deltaPct={dashboard.kpis.fieldsAtRisk.deltaPct}
            tooltip={`Fields with an unmuted stress zone. ${asOfTooltip}`}
          />
          <KpiTile
            icon={RiDropFill}
            label="Water Used"
            value={formatKiloliters(dashboard.kpis.waterUsedM3.value)}
            deltaPct={dashboard.kpis.waterUsedM3.deltaPct}
            tooltip={`Trailing 30 days. ${asOfTooltip}`}
          />
          <CropsStockedCard cropsStocked={dashboard.cropsStocked} />
        </KpiRow>

        <div className="flex flex-wrap items-start gap-4">
          <RegenerationCard regeneration={dashboard.regeneration} />
          <PlantingProductivityCard months={dashboard.plantingProductivity} />
        </div>

        {/* 400 + 24 + 335 + 16 + 335 = 1110px, exactly the measured content
            width (§1.3) — fixed 24px/16px gaps via nth-child margins, not a
            uniform flex `gap`, and no wrap: at a uniform gap this row came a
            couple of pixels over budget and silently dropped the third card
            to its own line, found live. */}
        <div className="flex items-start pb-6 [&>*:nth-child(1)]:mr-6 [&>*:nth-child(2)]:mr-4">
          <WeatherCard weather={dashboard.weather} />
          <GatheringRateCard gatheringRate={dashboard.gatheringRate} />
          <PendingTasksCard tasks={dashboard.pendingTasks} />
        </div>
      </PageContainer>
    </>
  );
}
