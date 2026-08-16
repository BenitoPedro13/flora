import { Injectable, NotFoundException } from '@nestjs/common';
import type { Dashboard, DashboardKpis } from '@flora/contracts';
import type { Tx } from '@flora/db';
import {
  buildFarmRollup,
  getFarm,
  getFarmRollup,
  getFarmScore,
  getLatestWeather,
  getPendingTasks,
  kpiDelta,
} from '@flora/db';

/**
 * `GET /farms/:id/dashboard` (architecture §8.3, TASK-home-dashboard §2.8).
 * No SQL here (invariant 5) — every read/write goes through `@flora/db`.
 */
@Injectable()
export class DashboardService {
  async get(tx: Tx, organizationId: string, farmId: string): Promise<Dashboard> {
    const farm = await getFarm(tx, organizationId, farmId);
    if (!farm) {
      throw new NotFoundException();
    }

    let { latest, sevenDaysAgo } = await getFarmRollup(tx, organizationId, farmId);
    let { current: currentScore, previous: previousScore } = await getFarmScore(
      tx,
      organizationId,
      farmId,
    );

    // Every farm starts with no rollup — a "your summary is being prepared"
    // screen on first login is a worse first impression than one aggregate
    // query that then never runs again on this path (§2.8's "why").
    if (!latest) {
      const today = farmLocalDate(farm.timezone);
      const built = await buildFarmRollup(tx, organizationId, farmId, today);
      latest = { day: today, payload: built.rollup, computedAt: new Date().toISOString() };
      currentScore = {
        computedOn: today,
        score: built.score.score,
        class: built.score.class,
        components: built.score.components,
        formulaVersion: built.score.formulaVersion,
      };
    }

    const kpis: DashboardKpis = {
      cropsStockedKg: {
        value: latest.payload.cropsStocked.totalKg,
        deltaPct: kpiDelta(latest.payload.cropsStocked.totalKg, sevenDaysAgo?.payload.cropsStocked.totalKg),
      },
      fieldsAtRisk: {
        value: latest.payload.fieldsAtRiskCount,
        deltaPct: kpiDelta(latest.payload.fieldsAtRiskCount, sevenDaysAgo?.payload.fieldsAtRiskCount),
      },
      waterUsedM3: {
        value: latest.payload.waterUsedM3,
        deltaPct: kpiDelta(latest.payload.waterUsedM3, sevenDaysAgo?.payload.waterUsedM3),
      },
    };

    const pendingTasks = await getPendingTasks(tx, organizationId, farmId, 2);
    const weather = await getLatestWeather(tx, organizationId, farmId);

    return {
      kpis,
      cropsStocked: latest.payload.cropsStocked,
      regeneration: {
        current: {
          score: currentScore!.score,
          class: currentScore!.class,
          components: currentScore!.components,
          formulaVersion: currentScore!.formulaVersion,
        },
        previous: previousScore
          ? { score: previousScore.score, class: previousScore.class, computedOn: previousScore.computedOn }
          : null,
      },
      plantingProductivity: latest.payload.plantingProductivity,
      gatheringRate: latest.payload.gatheringRate,
      pendingTasks,
      weather,
      meta: { day: latest.day, computedAt: latest.computedAt },
    };
  }
}

/** `en-CA` formats as `YYYY-MM-DD` — the farm's own local date, never the server's (architecture §5.3's pattern for `GROWTH_PCT_SQL`). */
function farmLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}
