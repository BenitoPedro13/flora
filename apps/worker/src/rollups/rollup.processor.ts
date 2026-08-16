import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Database } from '@flora/db';
import { buildFarmRollup, getFarm, withOrganization } from '@flora/db';
import { ROLLUP_QUEUE_NAME, type RollupJobData } from '../queue/queues.js';
import { DATABASE } from '../tokens.js';

/** `en-CA` formats as `YYYY-MM-DD` — the same pattern `apps/api/src/dashboard/dashboard.service.ts` uses for its own miss-path build. */
export function farmLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

/**
 * TASK-home-dashboard §2.9. No CDSE-quota-aware retry policy needed —
 * `buildFarmRollup` is aggregate SQL against the tenant's own data, not an
 * external call (invariant 1 is about Sentinel Hub specifically, and this
 * queue makes none).
 */
@Processor(ROLLUP_QUEUE_NAME)
export class RollupProcessor extends WorkerHost {
  private readonly logger = new Logger(RollupProcessor.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {
    super();
  }

  async process(job: Job<RollupJobData>): Promise<void> {
    const { organizationId, farmId } = job.data;
    await withOrganization(this.db, organizationId, async (tx) => {
      const farm = await getFarm(tx, organizationId, farmId);
      if (!farm) {
        // The farm was deleted between enqueue and processing — nothing to roll up.
        this.logger.warn(`farm ${farmId} not found — skipping rollup`);
        return;
      }
      const day = farmLocalDate(farm.timezone);
      await buildFarmRollup(tx, organizationId, farmId, day);
    });
  }
}
