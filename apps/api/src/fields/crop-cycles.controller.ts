import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import type { CropCycle } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { UpdateCropCycleDto } from './dto/update-crop-cycle.dto.js';
import { FieldsService } from './fields.service.js';

@Controller('crop-cycles')
export class CropCyclesController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Patch(':id')
  update(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCropCycleDto,
  ): Promise<CropCycle> {
    return this.fieldsService.updateCropCycleById(tx, user.org, id, body);
  }
}
