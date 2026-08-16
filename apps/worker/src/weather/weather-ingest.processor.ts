import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Database } from '@flora/db';
import { getFarm, upsertWeatherSnapshots, withOrganization } from '@flora/db';
import type { WeatherProvider } from '@flora/weather';
import { WEATHER_QUEUE_NAME, type WeatherIngestJobData } from '../queue/queues.js';
import { DATABASE, WEATHER_PROVIDER } from '../tokens.js';

/**
 * TASK-home-dashboard §2.6. One Open-Meteo call per farm, one row per
 * horizon written. No `[VERIFY]` left unresolved on this path — the daily
 * parameter names and base URL are confirmed against Open-Meteo's current
 * docs and a real captured response (`packages/weather`'s test fixture).
 */
@Processor(WEATHER_QUEUE_NAME)
export class WeatherIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(WeatherIngestProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(WEATHER_PROVIDER) private readonly provider: WeatherProvider,
  ) {
    super();
  }

  async process(job: Job<WeatherIngestJobData>): Promise<void> {
    const { organizationId, farmId } = job.data;
    await withOrganization(this.db, organizationId, async (tx) => {
      const farm = await getFarm(tx, organizationId, farmId);
      if (!farm) {
        this.logger.warn(`farm ${farmId} not found — skipping weather ingest`);
        return;
      }
      const [longitude, latitude] = farm.location.coordinates;
      const days = await this.provider.fetchDailyForecast({
        latitude,
        longitude,
        timezone: farm.timezone,
      });
      await upsertWeatherSnapshots(tx, organizationId, farmId, new Date(), days);
    });
  }
}
