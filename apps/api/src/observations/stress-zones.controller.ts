import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import type { StressZone } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { ListStressZonesQueryDto } from './dto/list-stress-zones-query.dto.js';
import { UpdateStressZoneDto } from './dto/update-stress-zone.dto.js';
import { StressZonesService } from './stress-zones.service.js';

@Controller()
export class StressZonesController {
  constructor(private readonly stressZonesService: StressZonesService) {}

  @Get('fields/:id/stress-zones')
  list(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListStressZonesQueryDto,
  ): Promise<StressZone[]> {
    return this.stressZonesService.list(tx, user.org, id, query);
  }

  @Patch('stress-zones/:id')
  update(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateStressZoneDto,
  ): Promise<StressZone> {
    return this.stressZonesService.update(tx, user.org, id, body);
  }

  @Delete('stress-zones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.stressZonesService.remove(tx, user.org, id);
  }
}
