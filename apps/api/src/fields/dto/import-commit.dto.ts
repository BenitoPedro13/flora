import { createZodDto } from 'nestjs-zod';
import { importCommitSchema } from '@flora/contracts';

export class ImportCommitDto extends createZodDto(importCommitSchema) {}
