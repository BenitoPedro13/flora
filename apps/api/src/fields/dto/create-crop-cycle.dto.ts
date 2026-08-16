import { createZodDto } from 'nestjs-zod';
import { createCropCycleSchema } from '@flora/contracts';

export class CreateCropCycleDto extends createZodDto(createCropCycleSchema) {}
