import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
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

  // Nest/Express's default JSON body limit is 100kb — too small for a field
  // boundary near the contracts vertex ceiling (10,000 positions) or a
  // multi-feature GeoJSON import (TASK-fields §2.2, §2.9). 10mb comfortably
  // covers both while still bounding the request; the vertex ceiling itself
  // is what actually rejects an oversized geometry, in zod, with a clean 400
  // — not body-parser's own opaque 413.
  app.use(json({ limit: '10mb' }));

  // Same-origin in every real deployment — apps/web proxies /api/v1/* through
  // Next rewrites so cookies stay same-site end to end (architecture §14,
  // TASK-auth-tenancy §7). CORS only matters for local development against a
  // client that isn't going through that proxy.
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.use(originCheckMiddleware);

  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(new ZodValidationPipe());
}
