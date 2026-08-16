import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import {
  SATELLITE_QUEUE_NAME,
  type SatelliteRefreshJobData,
} from '../queue/queues.js';
import { PG_POOL } from '../tokens.js';

/** Daily 03:00 farm-local (architecture §7.2) — the cron field literal, named so a future change is a diff, not a magic string re-typed. */
const DAILY_3AM = '0 3 * * *';

interface SchedulerFieldRow {
  organization_id: string;
  farm_id: string;
  field_id: string;
  timezone: string;
}

/**
 * One BullMQ Job Scheduler per **field** (not per farm, despite architecture
 * §7.2's phrasing) — a Job Scheduler carries exactly one fixed job template,
 * so per-field job data (`SatelliteRefreshJobData`) needs a per-field
 * scheduler id. Every field of a farm shares that farm's timezone, so this
 * still delivers "one wave of jobs per farm each night" (§10 records this
 * refinement). Calls `scheduler_fields_due_for_refresh()` directly against
 * the raw, unscoped pool — the *only* unscoped read in the system
 * (TASK-satellite-pipeline §2.4) — then every subsequent line of every job
 * runs inside `withOrganization` exactly like the API does.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(SATELLITE_QUEUE_NAME)
    private readonly queue: Queue<SatelliteRefreshJobData>,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    // Default false in dev — nobody wants a 3am job firing against live
    // CDSE quota from a laptop (§2.12).
    if (process.env.SATELLITE_SCHEDULE_ENABLED !== 'true') {
      this.logger.log(
        'SATELLITE_SCHEDULE_ENABLED is not "true" — skipping scheduler reconciliation',
      );
      return;
    }
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const { rows } = await this.pool.query<SchedulerFieldRow>(
      'SELECT * FROM scheduler_fields_due_for_refresh()',
    );
    for (const row of rows) {
      const schedulerId = `satellite-refresh:${row.field_id}`;
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: DAILY_3AM, tz: row.timezone },
        {
          data: { organizationId: row.organization_id, fieldId: row.field_id },
        },
      );
    }
    this.logger.log(`reconciled ${rows.length} satellite refresh schedulers`);
  }
}
