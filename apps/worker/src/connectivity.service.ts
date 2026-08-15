import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { PG_POOL, REDIS_CLIENT } from './tokens.js';

/**
 * Proves the worker reaches Postgres and Redis at boot. BullMQ consumers
 * replace this in Phase 2 — this task only creates the app and proves it
 * boots (TASK-foundations §2.4).
 */
@Injectable()
export class ConnectivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectivityService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    this.logger.log('connected to Postgres');
    await this.redis.ping();
    this.logger.log('connected to Redis');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.redis.disconnect();
  }
}
