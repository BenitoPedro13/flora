import { createZodDto } from 'nestjs-zod';
import { listObservationDatesQuerySchema } from '@flora/contracts';

export class ListObservationDatesQueryDto extends createZodDto(
  listObservationDatesQuerySchema,
) {}
