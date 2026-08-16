import type { WeatherSnapshotPayload } from "@flora/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { getLatestWeather } from "./rollups.js";
import { upsertWeatherSnapshots } from "./weather.js";

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
});
