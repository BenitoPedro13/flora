import { createZodDto } from 'nestjs-zod';
import { createFieldSchema } from '@flora/contracts';

export class CreateFieldDto extends createZodDto(createFieldSchema) {}
