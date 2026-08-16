import { createZodDto } from 'nestjs-zod';
import { updateStressZoneSchema } from '@flora/contracts';

export class UpdateStressZoneDto extends createZodDto(updateStressZoneSchema) {}
