import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';

import { Public } from '../../common/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'a-secret-that-is-long-enough-for-tests';

class Routes {
  protectedRoute() {}
  @Public()
  publicRoute() {}
}

function contextFor(handler: () => void, authorization?: string, type = 'http') {
  const request: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
  const context = {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  let jwt: JwtService;
  let guard: JwtAuthGuard;
  const protectedRoute = Routes.prototype.protectedRoute;
  const publicRoute = Routes.prototype.publicRoute;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET });
    guard = new JwtAuthGuard(jwt, new Reflector());
  });

  it('lets WebSocket handlers through: the socket is authenticated by the handshake instead', async () => {
    const { context } = contextFor(protectedRoute, undefined, 'ws');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('lets @Public() routes through without a token', async () => {
    const { context } = contextFor(publicRoute);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('accepts a valid token and exposes the user on the request', async () => {
    const token = await jwt.signAsync({ sub: 'user-1', username: 'alice' });
    const { context, request } = contextFor(protectedRoute, `Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', username: 'alice' });
  });

  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic abc'],
    ['a Bearer header without a token', 'Bearer'],
    ['garbage instead of a token', 'Bearer not.a.jwt'],
  ])('rejects %s', async (_name, header) => {
    const { context } = contextFor(protectedRoute, header);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'another-secret-another-secret-123' }).signAsync({
      sub: 'u',
      username: 'x',
    });
    const { context } = contextFor(protectedRoute, `Bearer ${forged}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ sub: 'u', username: 'x' }, { expiresIn: -10 });
    const { context } = contextFor(protectedRoute, `Bearer ${expired}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a validly signed token that has no subject', async () => {
    const noSub = await jwt.signAsync({ username: 'x' });
    const { context } = contextFor(protectedRoute, `Bearer ${noSub}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
