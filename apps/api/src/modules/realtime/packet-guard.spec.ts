import { describe, expect, it, vi } from 'vitest';

import { createPacketGuard } from './packet-guard';

const NOW = 1_800_000_000_000; // a fixed "now" in ms
const socketWith = (expiresAt: number) => ({
  data: { exp: expiresAt / 1000 },
  disconnect: vi.fn<(close?: boolean) => void>(),
});
const packet = ['message:send', {}];

function guardFor(options: { max?: number; windowMs?: number; expiresAt?: number } = {}) {
  let now = NOW;
  const socket = socketWith(options.expiresAt ?? NOW + 3_600_000);
  const guard = createPacketGuard(socket, {
    max: options.max ?? 3,
    windowMs: options.windowMs ?? 10_000,
    now: () => now,
  });
  const next = vi.fn<(error?: Error) => void>();
  return {
    socket,
    next,
    send: () => guard(packet, next),
    advance: (ms: number) => void (now += ms),
  };
}

describe('createPacketGuard', () => {
  it('lets packets through up to the limit', () => {
    const { send, next } = guardFor({ max: 3 });
    send();
    send();
    send();
    expect(next.mock.calls).toEqual([[], [], []]);
  });

  it('rejects further packets in the same window with an error, so the handler never runs', () => {
    const { send, next } = guardFor({ max: 3 });
    for (let i = 0; i < 5; i += 1) send();
    const calls = next.mock.calls;
    expect(calls.slice(0, 3).every(([error]) => error === undefined)).toBe(true);
    expect(calls.slice(3).map(([error]) => error?.message)).toEqual([
      'Rate limit exceeded',
      'Rate limit exceeded',
    ]);
  });

  it('starts counting again once the window has passed', () => {
    const { send, next, advance } = guardFor({ max: 2, windowMs: 10_000 });
    send();
    send();
    send(); // over the limit
    advance(10_001);
    send();
    expect(next.mock.calls.map(([error]) => error?.message)).toEqual([
      undefined,
      undefined,
      'Rate limit exceeded',
      undefined,
    ]);
  });

  it('keeps counting inside the window, however slowly the packets arrive', () => {
    const { send, next, advance } = guardFor({ max: 2, windowMs: 10_000 });
    send();
    advance(4_000);
    send();
    advance(4_000);
    send();
    expect(next.mock.calls.at(-1)?.[0]?.message).toBe('Rate limit exceeded');
  });

  it('disconnects a socket whose token has expired, without passing the packet on', () => {
    const { send, next, socket, advance } = guardFor({ expiresAt: NOW + 5_000 });
    send();
    expect(socket.disconnect).not.toHaveBeenCalled();

    advance(5_000);
    send();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(next).toHaveBeenCalledTimes(1); // only the first, valid packet was passed on
  });
});
