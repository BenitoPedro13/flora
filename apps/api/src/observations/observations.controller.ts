import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type {
  Observation,
  ObservationDates,
  RefreshAccepted,
  RefreshJobStatus,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { ListObservationDatesQueryDto } from './dto/list-observation-dates-query.dto.js';
import { ListObservationsQueryDto } from './dto/list-observations-query.dto.js';
import { RefreshRequestDto } from './dto/refresh-request.dto.js';
import { ObservationsService } from './observations.service.js';

@Controller('fields')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Get(':id/observations')
  list(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListObservationsQueryDto,
  ): Promise<Observation[]> {
    return this.observationsService.list(tx, user.org, id, query);
  }

  @Get(':id/observations/dates')
  listDates(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListObservationDatesQueryDto,
  ): Promise<ObservationDates> {
    return this.observationsService.listDates(tx, user.org, id, query);
  }

  @Post(':id/observations/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  refresh(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RefreshRequestDto,
  ): Promise<RefreshAccepted> {
    return this.observationsService.refresh(tx, user.org, id, body.mode);
  }

  @Get(':id/observations/refresh/:jobId')
  jobStatus(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('jobId') jobId: string,
  ): Promise<RefreshJobStatus> {
    return this.observationsService.jobStatus(tx, user.org, id, jobId);
  }
}
