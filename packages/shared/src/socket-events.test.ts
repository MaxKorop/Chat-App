import { describe, expect, expectTypeOf, it } from 'vitest';

import type { MessageDto } from './schemas/message';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from './socket-events';

const handle = (res: Ack<number>) => (res.ok ? res.data : res.error);

// The contract is purely types, so most of this file is checked by `tsc --noEmit` (pnpm typecheck).
describe('socket event contract', () => {
  it('commands are acknowledged, fire-and-forget events are not', () => {
    expectTypeOf<ClientToServerEvents['message:send']>().parameter(1).toBeFunction();
    expectTypeOf<ClientToServerEvents['message:send']>()
      .parameter(1)
      .parameter(0)
      .toEqualTypeOf<Ack<MessageDto>>();
    expectTypeOf<Parameters<ClientToServerEvents['chat:read']>['length']>().toEqualTypeOf<1>();
    expectTypeOf<Parameters<ClientToServerEvents['typing']>['length']>().toEqualTypeOf<1>();
  });

  it('the server pushes full messages and small payloads', () => {
    expectTypeOf<ServerToClientEvents['message:created']>()
      .parameter(0)
      .toEqualTypeOf<MessageDto>();
    expectTypeOf<ServerToClientEvents['message:deleted']>()
      .parameter(0)
      .toEqualTypeOf<{ chatId: string; messageId: string }>();
  });

  it('Ack narrows on `ok`', () => {
    expect(handle({ ok: true, data: 1 })).toBe(1);
    expect(handle({ ok: false, error: 'nope' })).toBe('nope');
  });
});
