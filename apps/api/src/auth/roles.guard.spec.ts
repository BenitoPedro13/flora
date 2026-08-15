import { Controller, Get, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { AccessTokenClaims } from './types.js';

@Controller('fixture')
class FixtureController {
  @Roles('owner', 'manager')
  @Get('managers-only')
  managersOnly() {
    return 'ok';
  }

  @Get('anyone')
  anyone() {
    return 'ok';
  }
}

function contextFor(
  handlerName: keyof FixtureController,
  user?: AccessTokenClaims,
): ExecutionContext {
  const request = { user };
  return {
    // Only used by Reflector to read @Roles() metadata off the function,
    // never invoked with `this` — safe despite the unbound reference.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => FixtureController.prototype[handlerName],
    getClass: () => FixtureController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a matching role', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = moduleRef.get(RolesGuard);

    const user: AccessTokenClaims = {
      sub: 'u1',
      org: 'o1',
      role: 'owner',
      jti: 'j1',
    };
    expect(guard.canActivate(contextFor('managersOnly', user))).toBe(true);
  });

  it('denies a non-matching role', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = moduleRef.get(RolesGuard);

    const user: AccessTokenClaims = {
      sub: 'u1',
      org: 'o1',
      role: 'viewer',
      jti: 'j1',
    };
    expect(guard.canActivate(contextFor('managersOnly', user))).toBe(false);
  });

  it('denies when there is no user', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = moduleRef.get(RolesGuard);

    expect(guard.canActivate(contextFor('managersOnly', undefined))).toBe(
      false,
    );
  });

  it('allows any authenticated role on a route with no @Roles()', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = moduleRef.get(RolesGuard);

    const user: AccessTokenClaims = {
      sub: 'u1',
      org: 'o1',
      role: 'viewer',
      jti: 'j1',
    };
    expect(guard.canActivate(contextFor('anyone', user))).toBe(true);
  });
});
