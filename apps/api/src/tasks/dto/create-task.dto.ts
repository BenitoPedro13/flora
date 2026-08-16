import { createZodDto } from 'nestjs-zod';
import { createTaskSchema } from '@flora/contracts';

export class CreateTaskDto extends createZodDto(createTaskSchema) {}
