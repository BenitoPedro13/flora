import { loadEnv } from '@flora/config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { assertBootRlsRole } from './tenancy/boot-assertion.js';

async function bootstrap() {
  // Validated before anything else boots: a missing or malformed variable
  // must fail loudly here, not surface as an undefined-value bug at first use.
  loadEnv();
  // The RLS boot assertion (TASK-auth-tenancy §2.7): a deployment pointing
  // DATABASE_URL at the owner role silently disables row-level security with
  // no other symptom, so this must fail loudly too, before the app accepts
  // any traffic.
  await assertBootRlsRole();

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.API_PORT ?? 3001);
}
bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
