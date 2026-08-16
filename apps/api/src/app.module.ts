import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FieldsModule } from './fields/fields.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservationsModule } from './observations/observations.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    TenancyModule,
    AuthModule,
    HealthModule,
    FieldsModule,
    ObservationsModule,
    TasksModule,
    DashboardModule,
    WeatherModule,
  ],
})
export class AppModule {}
