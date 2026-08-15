import { Module } from '@nestjs/common';
import { TenantProbeController } from './tenant-probe.controller.js';

/**
 * No TenancyModule import needed: `@TenantTx()` is a plain param decorator
 * reading `req.tx`, not a DI-resolved provider — see tenant-tx.decorator.ts.
 * `AppModule` (imported alongside this in tenancy.e2e.spec.ts) already
 * registers TenantInterceptor globally.
 */
@Module({
  controllers: [TenantProbeController],
})
export class TenantProbeModule {}
