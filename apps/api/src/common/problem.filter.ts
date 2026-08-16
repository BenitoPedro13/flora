import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ProblemDetails } from '@flora/contracts';
import { InvalidGeometryError, OneGrowingCycleError } from '@flora/db';

const TITLES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/**
 * RFC 9457 `application/problem+json` for every error response
 * (architecture §8.1). First task with real errors, so it lands here.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, detail, errors } = describe(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const body: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      instance: req.originalUrl,
      ...(detail ? { detail } : {}),
      ...(errors ? { errors } : {}),
    };

    res
      .status(status)
      .contentType('application/problem+json')
      .send(JSON.stringify(body));
  }
}

function describe(exception: unknown): {
  status: number;
  detail?: string;
  errors?: Array<{ path: string; message: string }>;
} {
  // TASK-fields §2.4: an invalid boundary is a drawing mistake for the
  // farmer to see (422 with `ST_IsValidReason`'s text), and a second growing
  // cycle is a field-level conflict (409) — neither is a server error.
  if (exception instanceof InvalidGeometryError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: exception.reason,
    };
  }
  if (exception instanceof OneGrowingCycleError) {
    return { status: HttpStatus.CONFLICT, detail: exception.message };
  }
  if (exception instanceof Error && exception.name === 'PayloadTooLargeError') {
    return { status: HttpStatus.PAYLOAD_TOO_LARGE, detail: exception.message };
  }

  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError() as {
      issues: Array<{ path: PropertyKey[]; message: string }>;
    };
    return {
      status: HttpStatus.BAD_REQUEST,
      detail: 'Validation failed',
      errors: zodError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as { message?: string | string[] }).message;
    return {
      status,
      detail: Array.isArray(message) ? message.join(', ') : message,
    };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR };
}
