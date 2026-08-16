import { Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { CdseSatelliteProvider } from '@flora/satellite';
import { createRasterStore } from '@flora/raster';
import { SatelliteQueueModule } from './queue/satellite.queue.js';
import { RefreshProcessor } from './satellite/refresh.processor.js';
import { SchedulerService } from './satellite/scheduler.service.js';
import {
  DATABASE,
  PG_POOL,
  RASTER_STORE,
  REDIS_CLIENT,
  SATELLITE_PROVIDER,
} from './tokens.js';

const logger = new Logger('AppModule');

@Module({
  imports: [
    BullModule.forRoot({
      // A distinct connection from REDIS_CLIENT's, per BullMQ's own
      // recommendation (a Worker's blocking connection shouldn't share a
      // client with app code) — cheap, Redis connections are not a scarce
      // resource here the way Postgres ones are.
      connection: parseRedisUrl(process.env.REDIS_URL!),
    }),
    SatelliteQueueModule,
  ],
  providers: [
    RefreshProcessor,
    SchedulerService,
    {
      provide: PG_POOL,
      // env is validated once at boot in main.ts, before this module is
      // instantiated, so DATABASE_URL is guaranteed present here.
      useFactory: () =>
        new Pool({ connectionString: process.env.DATABASE_URL }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis(process.env.REDIS_URL!, {
          lazyConnect: false,
          maxRetriesPerRequest: 1,
        }),
    },
    {
      provide: SATELLITE_PROVIDER,
      inject: [REDIS_CLIENT],
      // CDSE credentials are optional in packages/config (§2.12, §7 decision
      // 4) — a contributor building TASK-crop-stress off the seed has no
      // CDSE account. A blank secret still wires a real CdseSatelliteProvider
      // (it would fail loudly at the first real token request, which is
      // correct — the scheduler is SATELLITE_SCHEDULE_ENABLED=false by
      // default in dev, so that call never happens) rather than silently
      // swapping in FixtureSatelliteProvider, which would make a manual
      // refresh look like it worked when it didn't call CDSE at all.
      useFactory: (redis: Redis) => {
        const clientId = process.env.CDSE_CLIENT_ID ?? '';
        const clientSecret = process.env.CDSE_CLIENT_SECRET ?? '';
        if (!clientId || !clientSecret) {
          logger.warn(
            'CDSE_CLIENT_ID/CDSE_CLIENT_SECRET are unset — the satellite refresh will fail if it ever ' +
              'actually runs. This is expected with SATELLITE_SCHEDULE_ENABLED=false (the dev default) ' +
              'and no manual refresh triggered.',
          );
        }
        return new CdseSatelliteProvider(redis, { clientId, clientSecret });
      },
    },
    {
      provide: RASTER_STORE,
      useFactory: () =>
        createRasterStore({
          endpoint: process.env.S3_ENDPOINT!,
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          bucket: process.env.S3_BUCKET!,
        }),
    },
  ],
})
export class AppModule {}

/** ioredis wants host/port (or a full options object); BullMQ's own connection option accepts the same. */
function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 6379) };
}
