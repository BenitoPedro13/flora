import { Controller, Get } from '@nestjs/common';
import type { Farm } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { listFarms } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';

@Controller('farms')
export class FarmsController {
  @Get()
  list(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
  ): Promise<Farm[]> {
    return listFarms(tx, user.org);
  }
}
