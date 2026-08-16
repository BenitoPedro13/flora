import { Module } from '@nestjs/common';
import { CropCyclesController } from './crop-cycles.controller.js';
import { CropsController } from './crops.controller.js';
import { FarmsController } from './farms.controller.js';
import { FieldsController } from './fields.controller.js';
import { FieldsService } from './fields.service.js';
import { ImportService } from './import.service.js';

@Module({
  controllers: [
    FieldsController,
    CropCyclesController,
    CropsController,
    FarmsController,
  ],
  providers: [FieldsService, ImportService],
})
export class FieldsModule {}
