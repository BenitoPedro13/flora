import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import { WEATHER_QUEUE_NAME, type WeatherIngestJobData } from '../queue/queues.js';
import { PG_POOL } from '../tokens.js';

/** Hourly on the hour (§2.6) — Open-Meteo's free tier allows 5,000/hour, far above one call per farm. */
const HOURLY = '0 * * * *';

interface SchedulerFarmRow {
  organization_id: string;
  farm_id: string;
  timezone: string;
}

/**
 * One BullMQ Job Scheduler per farm (§2.6). Reuses
 * `scheduler_farms_due_for_rollup()` (0010_rollups_rls.sql) — despite the
 * name, its body is "every farm, unfiltered", the same universe weather
 * ingest needs; a second identical SECURITY DEFINER function would be a
 * needless fourth entry in `tenancy.spec.ts`'s allowlist for the same rows.
 */
@Injectable()
export class WeatherSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(WeatherSchedulerService.name);

  constructor(
    @InjectQueue(WEATHER_QUEUE_NAME)
    private readonly queue: Queue<WeatherIngestJobData>,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.WEATHER_SCHEDULE_ENABLED !== 'true') {
      this.logger.log(
        'WEATHER_SCHEDULE_ENABLED is not "true" — skipping scheduler reconciliation',
      );
      return;
    }
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const { rows } = await this.pool.query<SchedulerFarmRow>(
      'SELECT * FROM scheduler_farms_due_for_rollup()',
    );
    for (const row of rows) {
      const schedulerId = `weather:${row.farm_id}`;
      // Every farm shares the same hourly pattern — no per-farm timezone
      // needed for *when* the job fires, only for what it requests
      // (WeatherIngestProcessor reads farm.timezone itself).
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: HOURLY },
        { data: { organizationId: row.organization_id, farmId: row.farm_id } },
      );
    }
    this.logger.log(`reconciled ${rows.length} weather ingest schedulers`);
  }
}
