import { loadEnv } from '@flora/config/env';
import { assertNonBypassRlsRole } from '@flora/db';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Validated before anything else boots: a missing or malformed variable
  // must fail loudly here, not surface as an undefined-value bug at first use.
  loadEnv();
  // The RLS boot assertion (TASK-auth-tenancy §2.7): pointing DATABASE_URL at
  // the owner role silently disables row-level security with no other
  // symptom, so this must fail loudly too, before the worker processes any job.
  await assertNonBypassRlsRole(process.env.DATABASE_URL!);

  const logger = new Logger('worker');
  const app = await NestFactory.createApplicationContext(AppModule);

  const shutdown = async (signal: string) => {
    logger.log(`received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log('worker ready');
}
bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
