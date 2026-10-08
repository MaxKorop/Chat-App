import { vi } from 'vitest';

type Handler = (...args: never[]) => void;
type AckResponder = (event: string, payload: unknown) => unknown;

/**
 * A stand-in for the Socket.IO client that lets a test play the server:
 * `receive()` delivers a server event, `ackResponder` answers commands, `emitted` records what the
 * client sent. Install it with `vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock)`.
 */
export class FakeSocket {
  connected = false;
  recovered = false;
  emitted: { event: string; payload: unknown }[] = [];
  lastAckTimeout: number | undefined;
  /** how the "server" answers `emitWithAck`; return a value to resolve, or throw/reject to fail */
  ackResponder: AckResponder = () => ({ ok: true, data: undefined });
  private readonly handlers = new Map<string, Set<Handler>>();

  connect = vi.fn<() => this>(() => {
    this.connected = true;
    return this;
  });
  disconnect = vi.fn<() => this>(() => {
    this.connected = false;
    return this;
  });
  removeAllListeners = vi.fn<() => this>(() => {
    this.handlers.clear();
    return this;
  });

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  once(event: string, handler: Handler) {
    const wrapper = ((...args: never[]) => {
      this.off(event, wrapper);
      handler(...args);
    }) as Handler;
    return this.on(event, wrapper);
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  timeout(ms: number) {
    this.lastAckTimeout = ms;
    return {
      emitWithAck: async (event: string, payload: unknown) => {
        this.emitted.push({ event, payload });
        return this.ackResponder(event, payload);
      },
    };
  }

  /** Simulates the server sending `event` to this client. */
  receive(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? [])
      (handler as (...a: unknown[]) => void)(...args);
  }
  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }
  sent(event: string) {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  }
  reset() {
    this.handlers.clear();
    this.emitted = [];
    this.connected = false;
    this.recovered = false;
    this.lastAckTimeout = undefined;
    this.ackResponder = () => ({ ok: true, data: undefined });
    this.connect.mockClear();
    this.disconnect.mockClear();
    this.removeAllListeners.mockClear();
  }
}

export const fakeSocket = new FakeSocket();
/** the options `io()` was last called with, so tests can check how the real module configures it */
export const ioCalls: unknown[][] = [];
export const socketIoMock = {
  io: (...args: unknown[]) => {
    ioCalls.push(args);
    return fakeSocket;
  },
};
