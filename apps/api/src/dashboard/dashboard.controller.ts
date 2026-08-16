import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Dashboard } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { DashboardService } from './dashboard.service.js';

@Controller('farms')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(':id/dashboard')
  get(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Dashboard> {
    return this.dashboardService.get(tx, user.org, id);
  }
}
