import { createZodDto } from 'nestjs-zod';
import { listObservationsQuerySchema } from '@flora/contracts';

export class ListObservationsQueryDto extends createZodDto(
  listObservationsQuerySchema,
) {}
