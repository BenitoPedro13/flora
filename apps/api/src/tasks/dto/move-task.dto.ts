import { createZodDto } from 'nestjs-zod';
import { moveTaskSchema } from '@flora/contracts';

export class MoveTaskDto extends createZodDto(moveTaskSchema) {}
