import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database.module.js';
import { TenantInterceptor } from './tenant.interceptor.js';

/**
 * The tenancy substrate's Nest wiring (TASK-auth-tenancy §2.4): the global
 * `DATABASE` connection and the interceptor that opens a `withOrganization`
 * transaction per authenticated request. Controllers read that transaction
 * via the `@TenantTx()` param decorator (tenant-tx.decorator.ts), not DI.
 */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
  exports: [DatabaseModule],
})
export class TenancyModule {}
