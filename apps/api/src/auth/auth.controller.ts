import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthThrottlerGuard } from './auth-throttler.guard.js';
import { AuthService } from './auth.service.js';
import {
  clearSessionCookies,
  REFRESH_TOKEN_COOKIE,
  requestMeta,
  setSessionCookies,
} from './cookies.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.authService.login(
      body.email,
      body.password,
      requestMeta(req),
    );
    setSessionCookies(res, tokens);
  }

  @Public()
  // @UseGuards(AuthThrottlerGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof presented !== 'string') {
      throw new UnauthorizedException();
    }
    const tokens = await this.authService.refresh(presented, requestMeta(req));
    setSessionCookies(res, tokens);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof presented === 'string') {
      await this.authService.logout(presented);
    }
    clearSessionCookies(res);
  }
}
