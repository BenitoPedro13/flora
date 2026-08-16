import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { FarmWeather } from '@flora/contracts';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { FarmWeatherQueryDto } from './dto/farm-weather-query.dto.js';
import { WeatherService } from './weather.service.js';

@Controller('farms')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get(':id/weather')
  get(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: FarmWeatherQueryDto,
  ): Promise<FarmWeather> {
    return this.weatherService.get(tx, user.org, id, query.days);
  }
}
