import type { WeatherSnapshotPayload } from "@flora/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { getLatestWeather } from "./rollups.js";
import { getFarmWeek, upsertWeatherSnapshots } from "./weather.js";

/** Integration suite against real testcontainers PostGIS (TASK-home-dashboard §2.14). */

function day(offset: number, tempMaxC: number): WeatherSnapshotPayload {
  const d = new Date("2026-08-16T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return {
    date: d.toISOString().slice(0, 10),
    tempMaxC,
    tempMinC: tempMaxC - 8,
    weatherCode: 3,
    precipitationMm: 0,
    windSpeedMaxKmh: 10,
  };
}

describe("weather queries", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let farmId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db.insert(organizations).values({ name: "Weather Org", slug: "weather-spec-org" }).returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: "weather-spec@example.test", passwordHash: "unused" });

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Weather Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
      [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
    );
    farmId = rows[0]!.id;
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  it("writes one row per horizon, and getLatestWeather reads back today/tomorrow", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const days = Array.from({ length: 8 }, (_, i) => day(i, 30 + i));
      await upsertWeatherSnapshots(tx, orgId, farmId, new Date("2026-08-16T04:00:00Z"), days);

      const weather = await getLatestWeather(tx, orgId, farmId);
      expect(weather.today).toEqual({ date: "2026-08-16", tempC: 30, weatherCode: 3 });
      expect(weather.tomorrow).toEqual({ date: "2026-08-17", tempC: 31, weatherCode: 3 });
    });
  });

  it("a later ingestion run overwrites the read, by observed_at, not by inserting a duplicate", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const days = Array.from({ length: 8 }, (_, i) => day(i, 99));
      await upsertWeatherSnapshots(tx, orgId, farmId, new Date("2026-08-16T05:00:00Z"), days);

      const weather = await getLatestWeather(tx, orgId, farmId);
      expect(weather.today?.tempC).toBe(99);
    });
  });

  describe("getFarmWeek", () => {
    it("returns the newer of two ingestion runs, for every horizon", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const older = Array.from({ length: 8 }, (_, i) => day(i, 10 + i));
        await upsertWeatherSnapshots(tx, orgId, farmId, new Date("2026-08-16T06:00:00Z"), older);
        const newer = Array.from({ length: 8 }, (_, i) => day(i, 50 + i));
        await upsertWeatherSnapshots(tx, orgId, farmId, new Date("2026-08-16T07:00:00Z"), newer);

        const week = await getFarmWeek(tx, orgId, farmId, 8);
        expect(week.days).toHaveLength(8);
        expect(week.days.map((d) => d.payload.tempMaxC)).toEqual([50, 51, 52, 53, 54, 55, 56, 57]);
        expect(week.observedAt?.toISOString()).toBe(new Date("2026-08-16T07:00:00Z").toISOString());
      });
    });

    it("clamps to `days`, returning exactly horizons 0-2 in order for days=3", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const week = await getFarmWeek(tx, orgId, farmId, 3);
        expect(week.days.map((d) => d.horizon)).toEqual(["0", "1", "2"]);
      });
    });

    it("a row written without the new optional fields still round-trips", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        // No `hours`, no `precipProbabilityMaxPct`, no `windDirectionDominantDeg` —
        // exactly the shape every row in the table had before TASK-weather.
        await upsertWeatherSnapshots(tx, orgId, farmId, new Date("2026-08-16T08:00:00Z"), [day(0, 20)]);

        const week = await getFarmWeek(tx, orgId, farmId, 1);
        expect(week.days).toHaveLength(1);
        expect(week.days[0]!.payload.hours).toBeUndefined();
        expect(week.days[0]!.payload.tempMaxC).toBe(20);
      });
    });
  });
});
