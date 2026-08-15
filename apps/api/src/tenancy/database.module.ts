import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createDbClient } from '@flora/db';
import type { Pool } from 'pg';
import { DATABASE } from './database.tokens.js';

const POOL = Symbol('POOL');

/**
 * The one place `apps/api` opens its database connection — as `flora_app`
 * (`DATABASE_URL`), never the owner. Global so every feature module can
 * inject `DATABASE`, but the raw client itself is only ever imported here and
 * in `auth/` (the identity carve-out, TASK-auth-tenancy §2.1.5) — enforced by
 * §6.13's grep, not just convention.
 */
@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: () => createDbClient(process.env.DATABASE_URL!),
    },
    {
      provide: DATABASE,
      inject: [POOL],
      useFactory: (client: ReturnType<typeof createDbClient>) => client.db,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly client: { pool: Pool }) {}

  async onModuleDestroy() {
    await this.client.pool.end();
  }
}
