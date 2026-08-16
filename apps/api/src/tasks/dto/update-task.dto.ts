import { createZodDto } from 'nestjs-zod';
import { updateTaskSchema } from '@flora/contracts';

export class UpdateTaskDto extends createZodDto(updateTaskSchema) {}
