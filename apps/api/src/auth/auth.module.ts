import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MeController } from './me.controller.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    TenancyModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SIGNING_KEY,
        signOptions: {
          expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
        },
      }),
    }),
    // 5 attempts / 15 min per (IP, email), backed by the Redis already in
    // compose (TASK-auth-tenancy §2.4) — applied to /auth/login and
    // /auth/refresh via AuthThrottlerGuard, not registered globally here.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ limit: 5, ttl: 15 * 60 * 1000 }],
        storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    // Global, default-deny (TASK-auth-tenancy §2.4): a new controller is
    // authenticated unless it opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
