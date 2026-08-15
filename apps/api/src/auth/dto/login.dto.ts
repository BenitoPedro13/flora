import { createZodDto } from 'nestjs-zod';
import { loginRequestSchema } from '@flora/contracts';

export class LoginDto extends createZodDto(loginRequestSchema) {}
