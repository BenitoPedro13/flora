import { loadEnv } from '@flora/config/env';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Validated before anything else boots: a missing or malformed variable
  // must fail loudly here, not surface as an undefined-value bug at first use.
  loadEnv();

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
