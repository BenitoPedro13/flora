import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

/** `INestApplication.getHttpServer()` is typed `any` in Nest itself — one explicit cast, not one per call site. */
export function getServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
