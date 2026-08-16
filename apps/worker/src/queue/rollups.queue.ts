import { BullModule } from '@nestjs/bullmq';
import { ROLLUP_QUEUE_NAME } from './queues.js';

/**
 * Registration for the `rollups` queue (TASK-home-dashboard §2.9). No
 * external API call inside a rollup job — it's aggregate SQL against the
 * tenant's own data — so retries are cheaper to reason about than the
 * satellite queue's CDSE-quota-aware backoff; a plain fixed backoff is
 * enough.
 */
export const RollupQueueModule = BullModule.registerQueue({
  name: ROLLUP_QUEUE_NAME,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 1_000 },
  },
});
