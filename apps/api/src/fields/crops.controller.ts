import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import type { Crop } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { insertCrop, listCrops } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { CreateCropDto } from './dto/create-crop.dto.js';

@Controller('crops')
export class CropsController {
  @Get()
  list(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
  ): Promise<Crop[]> {
    return listCrops(tx, user.org);
  }

  /** The field editor's inline "add species" path (TASK-fields §2.8). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: CreateCropDto,
  ): Promise<Crop> {
    return insertCrop(tx, user.org, body.name);
  }
}
