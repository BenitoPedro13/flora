import { createZodDto } from 'nestjs-zod';
import { refreshRequestSchema } from '@flora/contracts';

export class RefreshRequestDto extends createZodDto(refreshRequestSchema) {}
