import { createZodDto } from 'nestjs-zod';
import { farmWeatherQuerySchema } from '@flora/contracts';

export class FarmWeatherQueryDto extends createZodDto(farmWeatherQuerySchema) {}
