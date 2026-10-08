import type { ClientToServerEvents, ServerToClientEvents } from '@chat/shared';
import { io, type Socket } from 'socket.io-client';

import type { TestApp } from './app';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Person = Parameters<TestApp['auth']>[0];

/** Real Socket.IO clients talking to the test server over a real WebSocket. */
export class TestClients {
  private readonly sockets: ClientSocket[] = [];

  constructor(
    private readonly url: string,
    private readonly t: TestApp,
  ) {}

  /** Connects with a valid token for `person` and resolves once the server accepted the connection. */
  async connect(
    person: Person,
    options: { token?: string; before?: (socket: ClientSocket) => void } = {},
  ): Promise<ClientSocket> {
    const token = options.token ?? this.t.jwt.sign({ sub: person.id, username: person.username });
    const socket = this.create({ auth: { token } });
    options.before?.(socket); // listeners that must be in place before the first packet can arrive
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', (error) =>
        reject(new Error(`could not connect: ${error.message}`)),
      );
    });
    return socket;
  }

  /** Tries to connect and resolves with the reason the server gave for refusing. */
  async refused(options: Record<string, unknown>): Promise<string> {
    const socket = this.create(options);
    return new Promise<string>((resolve, reject) => {
      socket.once('connect', () =>
        reject(new Error('the server accepted a connection it should have refused')),
      );
      socket.once('connect_error', (error) => resolve(error.message));
    });
  }

  closeAll() {
    for (const socket of this.sockets) socket.disconnect();
    this.sockets.length = 0;
  }

  private create(options: Record<string, unknown>): ClientSocket {
    const socket: ClientSocket = io(this.url, {
      transports: ['websocket'],
      reconnection: false, // a test wants to see a disconnect, not hide it
      forceNew: true,
      ...options,
    });
    this.sockets.push(socket);
    return socket;
  }
}

/** The first arguments of the next `event`. Call it BEFORE triggering whatever causes the event. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 2_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no "${event}" event within ${timeoutMs} ms`)),
      timeoutMs,
    );
    socket.once(event, ((payload: never) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}

/** Resolves if no `event` arrives within `ms`; rejects if one does. */
export function expectNoEvent(
  socket: ClientSocket,
  event: keyof ServerToClientEvents,
  ms = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = () => reject(new Error(`unexpected "${event}" event`));
    socket.once(event, listener as never);
    setTimeout(() => {
      socket.off(event, listener as never);
      resolve();
    }, ms);
  });
}

export const disconnectReason = (socket: ClientSocket, timeoutMs = 3_000) =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the socket was not disconnected')), timeoutMs);
    socket.once('disconnect', (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
