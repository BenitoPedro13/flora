import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { FieldsModule } from './fields/fields.module.js';
import { HealthModule } from './health/health.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

@Module({
  imports: [TenancyModule, AuthModule, HealthModule, FieldsModule],
})
export class AppModule {}
