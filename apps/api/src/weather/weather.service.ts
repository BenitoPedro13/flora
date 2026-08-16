import { Injectable, NotFoundException } from '@nestjs/common';
import type { FarmWeather, FarmWeatherDay } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { getFarm, getFarmWeek } from '@flora/db';

/** Two missed hourly runs is the staleness signal (§2.4) — the schedule fires hourly. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * `GET /farms/:id/weather` (architecture §8, TASK-weather §2.4). No SQL
 * here (invariant 5) — every read goes through `@flora/db`. This service
 * imports `@flora/db` and nothing else — `@flora/weather`'s Open-Meteo
 * client belongs to the worker's ingest job, never a request handler
 * (invariant 1, NFR-4).
 */
@Injectable()
export class WeatherService {
  async get(tx: Tx, organizationId: string, farmId: string, days: number): Promise<FarmWeather> {
    const farm = await getFarm(tx, organizationId, farmId);
    if (!farm) {
      throw new NotFoundException();
    }

    const week = await getFarmWeek(tx, organizationId, farmId, days);

    const isStale = !week.observedAt || Date.now() - week.observedAt.getTime() > STALE_AFTER_MS;

    const days_: FarmWeatherDay[] = week.days.map((row) => ({
      date: row.payload.date,
      horizon: row.horizon,
      tempMaxC: row.payload.tempMaxC,
      tempMinC: row.payload.tempMinC,
      weatherCode: row.payload.weatherCode,
      precipitationMm: row.payload.precipitationMm,
      precipProbabilityPct: row.payload.precipProbabilityMaxPct,
      windSpeedMaxKmh: row.payload.windSpeedMaxKmh,
      windDirectionDeg: row.payload.windDirectionDominantDeg,
      uvIndexMax: row.payload.uvIndexMax,
      sunrise: row.payload.sunrise,
      sunset: row.payload.sunset,
      hours: row.payload.hours ?? [],
    }));

    return {
      farmId,
      timezone: farm.timezone,
      // Render, never hide (NFR-8's rule): a farm never ingested has no
      // observedAt at all — fall back to "now" rather than crash the schema's
      // z.iso.datetime() on a null. isStale already carries the real signal.
      observedAt: (week.observedAt ?? new Date()).toISOString(),
      isStale,
      days: days_,
    };
  }
}
