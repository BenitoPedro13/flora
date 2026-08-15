import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Health } from '@flora/contracts';
import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): Health {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async getReadiness() {
    const result = await this.healthService.checkReadiness();
    if (!result.ready) {
      throw new ServiceUnavailableException({
        status: 'error',
        failed: result.failed,
      });
    }
    return { status: 'ok' };
  }
}
