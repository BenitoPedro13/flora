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
import type { Task, TaskBoard } from '@flora/contracts';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import type { Tx } from '@flora/db';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AccessTokenClaims } from '../auth/types.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  board(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Query() query: ListTasksQueryDto,
  ): Promise<TaskBoard> {
    return this.tasksService.board(tx, user.org, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: CreateTaskDto,
  ): Promise<Task> {
    return this.tasksService.create(tx, user.org, body);
  }

  @Patch(':id')
  update(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(tx, user.org, id, body);
  }

  /**
   * A separate route from the general `PATCH` deliberately (§2.4): a drag has
   * a distinct contract (neighbours, not values), a distinct latency budget
   * (NFR-9), and must not be reachable by a form submit that happens to
   * include a `status`.
   */
  @Patch(':id/move')
  move(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MoveTaskDto,
  ): Promise<Task> {
    return this.tasksService.move(tx, user.org, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @TenantTx() tx: Tx,
    @CurrentUser() user: AccessTokenClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.tasksService.remove(tx, user.org, id);
  }
}
