import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { PG_POOL, REDIS_CLIENT } from './health.tokens.js';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: PG_POOL,
      // env is validated once at boot in main.ts, before this module is
      // instantiated, so DATABASE_URL/REDIS_URL are guaranteed present here.
      useFactory: () =>
        new Pool({ connectionString: process.env.DATABASE_URL }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis(process.env.REDIS_URL!, {
          lazyConnect: false,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
})
export class HealthModule {}
