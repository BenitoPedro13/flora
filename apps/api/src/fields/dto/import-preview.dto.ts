import { createZodDto } from 'nestjs-zod';
import { importFeatureCollectionSchema } from '@flora/contracts';

export class ImportPreviewDto extends createZodDto(
  importFeatureCollectionSchema,
) {}
