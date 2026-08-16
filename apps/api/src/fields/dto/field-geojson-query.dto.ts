import { createZodDto } from 'nestjs-zod';
import { fieldGeojsonQuerySchema } from '@flora/contracts';

export class FieldGeojsonQueryDto extends createZodDto(
  fieldGeojsonQuerySchema,
) {}
