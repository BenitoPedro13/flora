import { loadEnv } from '@flora/config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Validated before anything else boots: a missing or malformed variable
  // must fail loudly here, not surface as an undefined-value bug at first use.
  loadEnv();
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
