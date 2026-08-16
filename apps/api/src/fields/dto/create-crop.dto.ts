import { createZodDto } from 'nestjs-zod';
import { createCropSchema } from '@flora/contracts';

export class CreateCropDto extends createZodDto(createCropSchema) {}
