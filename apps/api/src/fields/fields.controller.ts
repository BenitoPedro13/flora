import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CropCycle,
  Field,
  FieldFeatureCollection,
  FieldSummary,
  Page,
} from '@flora/contracts';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { CreateCropCycleDto } from './dto/create-crop-cycle.dto.js';
import { CreateFieldDto } from './dto/create-field.dto.js';
import { FieldGeojsonQueryDto } from './dto/field-geojson-query.dto.js';
import { ImportCommitDto } from './dto/import-commit.dto.js';
import { ImportPreviewDto } from './dto/import-preview.dto.js';
import { ListFieldsQueryDto } from './dto/list-fields-query.dto.js';
import { UpdateFieldDto } from './dto/update-field.dto.js';
import { FieldsService } from './fields.service.js';
import { ImportService } from './import.service.js';

@Controller('fields')
export class FieldsController {
  constructor(
    private readonly fieldsService: FieldsService,
    private readonly importService: ImportService,
  ) {}

  @Get()
  list(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Query() query: ListFieldsQueryDto,
  ): Promise<Page<FieldSummary>> {
    return this.fieldsService.list(tx, user.org, query);
  }

  @Get('geojson')
  geojson(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Query() query: FieldGeojsonQueryDto,
  ): Promise<FieldFeatureCollection> {
    return this.fieldsService.geojson(tx, user.org, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: CreateFieldDto,
  ): Promise<Field> {
    return this.fieldsService.create(tx, user.org, body);
  }

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  importPreview(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: ImportPreviewDto,
  ) {
    return this.importService.preview(tx, user.org, body);
  }

  @Post('import/commit')
  importCommit(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: ImportCommitDto,
  ) {
    return this.importService.commit(tx, user.org, body);
  }

  @Get(':id')
  get(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Field> {
    return this.fieldsService.get(tx, user.org, id);
  }

  @Patch(':id')
  update(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateFieldDto,
  ): Promise<Field> {
    return this.fieldsService.update(tx, user.org, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.fieldsService.remove(tx, user.org, id);
  }

  @Post(':id/crop-cycles')
  @HttpCode(HttpStatus.CREATED)
  addCropCycle(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateCropCycleDto,
  ): Promise<CropCycle> {
    return this.fieldsService.addCropCycle(tx, user.org, id, body);
  }
}
