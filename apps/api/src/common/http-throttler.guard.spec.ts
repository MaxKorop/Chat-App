import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpThrottlerGuard } from './http-throttler.guard';

const contextOfType = (type: string) => ({ getType: () => type }) as unknown as ExecutionContext;
// skip the constructor: only the type check is under test
const makeGuard = () => Object.create(HttpThrottlerGuard.prototype) as HttpThrottlerGuard;

describe('HttpThrottlerGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets WebSocket gateway handlers through (sockets have their own limiter)', async () => {
    const parent = vi.spyOn(ThrottlerGuard.prototype, 'canActivate');
    await expect(makeGuard().canActivate(contextOfType('ws'))).resolves.toBe(true);
    expect(parent).not.toHaveBeenCalled();
  });

  it('applies the normal rate limit to HTTP requests', async () => {
    const parent = vi.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(false);
    await expect(makeGuard().canActivate(contextOfType('http'))).resolves.toBe(false);
    expect(parent).toHaveBeenCalledTimes(1);
  });
});
