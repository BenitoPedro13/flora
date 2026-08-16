import type { WeatherSnapshotPayload } from '@flora/contracts';
import { createDbClient, getFarmWeek, organizations, users, withOrganization } from '@flora/db';
import { startTestInfra, type TestInfra } from '@flora/db/test/containers';
import { FixtureWeatherProvider } from '@flora/weather';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WeatherIngestJobData } from '../queue/queues.js';
import { WeatherIngestProcessor } from './weather-ingest.processor.js';

/**
 * TASK-weather §2.8. `WeatherIngestProcessor` needs no code change for the
 * richer payload — this proves that rather than assuming it: whatever
 * `WeatherProvider.fetchDailyForecast` returns (here, a fixture with an
 * `hours` series, exactly the shape `packages/weather`'s real client now
 * produces) is what `upsertWeatherSnapshots` writes, unmodified.
 */
function dayWithHours(offset: number): WeatherSnapshotPayload {
  const d = new Date('2026-08-16T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  const date = d.toISOString().slice(0, 10);
  return {
    date,
    tempMaxC: 30,
    tempMinC: 20,
    weatherCode: 1,
    precipitationMm: 0,
    windSpeedMaxKmh: 15,
    precipProbabilityMaxPct: 5,
    windDirectionDominantDeg: 90,
    hours: Array.from({ length: 24 }, (_, h) => ({
      time: `${date}T${String(h).padStart(2, '0')}:00`,
      temperatureC: 20 + h,
      windSpeedKmh: 10,
      windDirectionDeg: 90,
      pressureMslHpa: 1015,
      uvIndex: 3,
      precipProbabilityPct: 5,
    })),
  };
}

describe('WeatherIngestProcessor', () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let farmId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db
      .insert(organizations)
      .values({ name: 'Ingest Org', slug: 'weather-ingest-spec-org' })
      .returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: 'weather-ingest-spec@example.test', passwordHash: 'unused' });

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Ingest Farm', ST_GeomFromGeoJSON($2), 'America/Sao_Paulo') RETURNING id`,
      [orgId, JSON.stringify({ type: 'Point', coordinates: [-48.59, -15.94] })],
    );
    farmId = rows[0]!.id;
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  it('persists a fixture day carrying `hours` unmodified, through a real Postgres round trip', async () => {
    const provider = new FixtureWeatherProvider(Array.from({ length: 8 }, (_, i) => dayWithHours(i)));
    const processor = new WeatherIngestProcessor(owner.db, provider);

    const job = { data: { organizationId: orgId, farmId } as WeatherIngestJobData } as Job<WeatherIngestJobData>;
    await processor.process(job);

    await withOrganization(owner.db, orgId, async (tx) => {
      const week = await getFarmWeek(tx, orgId, farmId, 8);
      expect(week.days).toHaveLength(8);
      const today = week.days.find((d) => d.horizon === '0')!;
      expect(today.payload.hours).toHaveLength(24);
      expect(today.payload.hours![12]).toEqual({
        time: `${today.payload.date}T12:00`,
        temperatureC: 32,
        windSpeedKmh: 10,
        windDirectionDeg: 90,
        pressureMslHpa: 1015,
        uvIndex: 3,
        precipProbabilityPct: 5,
      });
    });

    // Sanity on the raw column, independent of getFarmWeek's own parsing.
    const raw = await owner.pool.query<{ payload: { hours?: unknown[] } }>(
      `SELECT payload FROM weather_snapshots WHERE organization_id = $1 AND farm_id = $2 AND horizon = '0'`,
      [orgId, farmId],
    );
    expect(raw.rows[0]!.payload.hours).toHaveLength(24);
  });
});
