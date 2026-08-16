import { BullModule } from '@nestjs/bullmq';
import { WEATHER_QUEUE_NAME } from './queues.js';

/** Registration for the `weather` queue (TASK-home-dashboard §2.6) — Open-Meteo has no per-request cost the way CDSE's PU budget does, so a plain fixed backoff is enough. */
export const WeatherQueueModule = BullModule.registerQueue({
  name: WEATHER_QUEUE_NAME,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 1_000 },
  },
});
