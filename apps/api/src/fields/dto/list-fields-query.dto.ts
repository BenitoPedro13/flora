import { createZodDto } from 'nestjs-zod';
import { listFieldsQuerySchema } from '@flora/contracts';

export class ListFieldsQueryDto extends createZodDto(listFieldsQuerySchema) {}
