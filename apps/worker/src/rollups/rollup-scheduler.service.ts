import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import { ROLLUP_QUEUE_NAME, type RollupJobData } from '../queue/queues.js';
import { PG_POOL } from '../tokens.js';

/** 30 minutes after the satellite wave's 03:00 farm-local, so a rollup sees the night's fresh observations (TASK-home-dashboard §2.9). */
const DAILY_330AM = '30 3 * * *';

interface SchedulerFarmRow {
  organization_id: string;
  farm_id: string;
  timezone: string;
}

/**
 * One BullMQ Job Scheduler per **farm** (§2.9) — mirrors `SchedulerService`
 * exactly, including calling `scheduler_farms_due_for_rollup()` against the
 * raw, unscoped pool (the only unscoped read in this path — every subsequent
 * line runs inside `withOrganization`, same as the satellite scheduler).
 */
@Injectable()
export class RollupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RollupSchedulerService.name);

  constructor(
    @InjectQueue(ROLLUP_QUEUE_NAME)
    private readonly queue: Queue<RollupJobData>,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    // Same "off by default in dev" reasoning as SATELLITE_SCHEDULE_ENABLED.
    if (process.env.ROLLUP_SCHEDULE_ENABLED !== 'true') {
      this.logger.log(
        'ROLLUP_SCHEDULE_ENABLED is not "true" — skipping scheduler reconciliation',
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
      const schedulerId = `rollup:${row.farm_id}`;
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: DAILY_330AM, tz: row.timezone },
        { data: { organizationId: row.organization_id, farmId: row.farm_id } },
      );
    }
    this.logger.log(`reconciled ${rows.length} rollup schedulers`);
  }
}
