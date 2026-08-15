import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { PG_POOL, REDIS_CLIENT } from './health.tokens.js';

const DEPENDENCY_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timed out')), ms),
    ),
  ]);
}

export type ReadinessResult =
  { ready: true } | { ready: false; failed: string[] };

@Injectable()
export class HealthService implements OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    const failed: string[] = [];

    const [dbResult, redisResult] = await Promise.allSettled([
      withTimeout(this.pool.query('SELECT 1'), DEPENDENCY_TIMEOUT_MS),
      withTimeout(this.redis.ping(), DEPENDENCY_TIMEOUT_MS),
    ]);

    if (dbResult.status === 'rejected') {
      failed.push('database');
    }
    if (redisResult.status === 'rejected') {
      failed.push('cache');
    }

    return failed.length === 0 ? { ready: true } : { ready: false, failed };
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.redis.disconnect();
  }
}
