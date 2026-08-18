import { redirect } from "next/navigation";
import { z } from "zod";
import { farmSchema, farmWeatherSchema, fieldSummarySchema, pageSchema } from "@flora/contracts";
import { RiCalendarLine, RiNotification3Line, RiSearchLine, RiSunCloudyLine } from "@remixicon/react";
import { getSession } from "@/lib/session";
import { apiFetchServer } from "@/lib/api-client.server";
import * as Button from "@/components/ui/button";
import * as CompactButton from "@/components/ui/compact-button";
import * as Tooltip from "@/components/ui/tooltip";
import { CreateTaskButton } from "@/components/flora/create-task-button";
import { IconTile } from "@/components/flora/icon-tile";
import { PageContainer } from "@/components/flora/page-container";
import { PageHeader } from "@/components/flora/page-header";
import { StaleBadge } from "@/components/flora/stale-badge";
import { WeatherBoard } from "@/components/flora/weather-board";
import { createPageMetadata } from "@/lib/seo/metadata";

export const metadata = createPageMetadata({
  title: "Weather",
  description: "Eight-day farm forecast with temperature, wind, UV, and hourly detail.",
  path: "/weather",
});

/**
 * Weather (`3:5274`, Phase 5, TASK-weather §2.7) — a Server Component
 * fetching once, following Home's shape exactly (architecture §9.2): the
 * page and header are server-rendered, `WeatherBoard` is the one client
 * island holding the day-selection state.
 *
 * **The page scrolls** (933 > 900, §1.3 note 1) — `PageContainer`'s own
 * `min-h-0` flex chain, `overflow-y-auto` on this container.
 */
export default async function WeatherPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [farms, fieldsPage] = await Promise.all([
    apiFetchServer("/api/v1/farms", z.array(farmSchema)),
    apiFetchServer("/api/v1/fields?sort=position&limit=100", pageSchema(fieldSummarySchema)),
  ]);

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
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <span>
              <Button.Root variant="neutral" mode="stroke" size="small" disabled>
                <Button.Icon as={RiCalendarLine} />
                Schedule
              </Button.Root>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>A date-range schedule view isn&apos;t built yet</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
      <CreateTaskButton fields={fieldsPage.items} />
    </>
  );

  if (farms.length === 0) {
    return (
      <>
        <PageHeader
          leading={
            <IconTile size="40" tone="primary">
              <RiSunCloudyLine className="size-5" />
            </IconTile>
          }
          title="Weather"
          actions={headerActions}
        />
        <PageContainer className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="text-label-md text-text-strong-950">No farm yet</p>
          <p className="text-paragraph-sm text-text-sub-600">Add a farm to see its forecast here.</p>
        </PageContainer>
      </>
    );
  }

  // Multi-farm orgs get the first farm by name (Home's own §7 decision 9
  // precedent) — the design has no farm switcher and every seeded org has
  // exactly one.
  const farm = farms[0]!;
  const weather = await apiFetchServer(`/api/v1/farms/${farm.id}/weather?days=8`, farmWeatherSchema);

  return (
    <>
      <PageHeader
        leading={
          <IconTile size="40" tone="primary">
            <RiSunCloudyLine className="size-5" />
          </IconTile>
        }
        title={
          <span className="flex items-center gap-2">
            Weather
            {weather.isStale ? (
              <StaleBadge
                label={`Stale · last updated ${formatBadgeDate(weather.observedAt)}`}
                reason="The hourly ingest hasn't run successfully in the last 2 hours."
              />
            ) : null}
          </span>
        }
        subtitle={farm.name}
        actions={headerActions}
      />

      <PageContainer className="flex flex-1 flex-col overflow-y-auto py-6">
        {weather.days.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-label-md text-text-strong-950">No forecast yet</p>
            <p className="text-paragraph-sm text-text-sub-600">The ingest job hasn&apos;t run for this farm.</p>
          </div>
        ) : (
          <WeatherBoard days={weather.days} />
        )}
      </PageContainer>
    </>
  );
}

function formatBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
