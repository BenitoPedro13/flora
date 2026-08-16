import { BullModule } from '@nestjs/bullmq';
import { SATELLITE_QUEUE_NAME } from './queues.js';

/**
 * Registration for the `satellite` queue (architecture §6.3, §11.1,
 * TASK-satellite-pipeline §2.4). `attempts: 5` with exponential backoff and
 * BullMQ's built-in `jitter` (a percentage, not a custom strategy —
 * confirmed against bullmq 6's `BackoffOptions`) — five identical retries
 * hitting CDSE at the same instant would just fail together again.
 * Concurrency (2, CDSE's free-tier concurrent-request limit, not a tuning
 * knob) is set on the `@Processor` decorator in `refresh.processor.ts`, not
 * here — it's a worker-side setting, not a queue-registration one.
 *
 * `apps/api/src/observations/refresh-queue.provider.ts` duplicates this same
 * `defaultJobOptions` block for its own producer `Queue` (TASK-crop-stress
 * §1.1) — BullMQ applies the adding instance's options, not the processor's,
 * so a manual refresh needs its own copy of `attempts`/`backoff` to retry at
 * all. If this block changes, change that one too.
 */
export const SatelliteQueueModule = BullModule.registerQueue({
  name: SATELLITE_QUEUE_NAME,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000, jitter: 0.5 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
  },
});
