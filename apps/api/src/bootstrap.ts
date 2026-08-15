import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from 'nestjs-zod';
import { originCheckMiddleware } from './common/origin-check.middleware.js';
import { ProblemDetailsFilter } from './common/problem.filter.js';

/**
 * Every piece of global HTTP configuration, shared between main.ts and the
 * e2e test suites (apps/api/test/*.e2e.spec.ts) so tests exercise the exact
 * request pipeline production runs, not a reconstruction of it.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  // Same-origin in every real deployment — apps/web proxies /api/v1/* through
  // Next rewrites so cookies stay same-site end to end (architecture §14,
  // TASK-auth-tenancy §7). CORS only matters for local development against a
  // client that isn't going through that proxy.
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.use(originCheckMiddleware);

  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(new ZodValidationPipe());
}
