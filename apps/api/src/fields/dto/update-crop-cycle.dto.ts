import { createZodDto } from 'nestjs-zod';
import { updateCropCycleSchema } from '@flora/contracts';

export class UpdateCropCycleDto extends createZodDto(updateCropCycleSchema) {}
