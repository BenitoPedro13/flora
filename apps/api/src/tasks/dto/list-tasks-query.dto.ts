import { createZodDto } from 'nestjs-zod';
import { listTasksQuerySchema } from '@flora/contracts';

export class ListTasksQueryDto extends createZodDto(listTasksQuerySchema) {}
