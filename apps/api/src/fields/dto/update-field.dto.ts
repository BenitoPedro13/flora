import { createZodDto } from 'nestjs-zod';
import { updateFieldSchema } from '@flora/contracts';

export class UpdateFieldDto extends createZodDto(updateFieldSchema) {}
