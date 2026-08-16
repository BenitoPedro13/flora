import { createZodDto } from 'nestjs-zod';
import { listStressZonesQuerySchema } from '@flora/contracts';

export class ListStressZonesQueryDto extends createZodDto(
  listStressZonesQuerySchema,
) {}
