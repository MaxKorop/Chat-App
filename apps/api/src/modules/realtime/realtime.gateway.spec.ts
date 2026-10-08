import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PresenceService } from '../presence/presence.service';
import { type AppSocket, RealtimeGateway } from './realtime.gateway';

const ALICE = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const BOB = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';
const CHAT = '11111111-1111-4111-8111-111111111111';
const MESSAGE = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';

const jwt = new JwtService({
  secret: 'a-secret-that-is-long-enough-for-tests',
  signOptions: { expiresIn: '1h' },
});

// What the gateway needs from the rest of the app. Everything else is real.
type AnyFunction = (...args: never[]) => unknown;
const messages = {
  send: vi.fn<AnyFunction>(),
  edit: vi.fn<AnyFunction>(),
  delete: vi.fn<AnyFunction>(),
};
const chats = { markRead: vi.fn<AnyFunction>(), getMemberChatIds: vi.fn<AnyFunction>() };
const prisma = { user: { update: vi.fn<AnyFunction>() } };

function makeGateway(presence = new PresenceService()) {
  const gateway = new RealtimeGateway(
    jwt,
    prisma as never,
    presence,
    chats as never,
    messages as never,
  );
  // a stand-in for the Socket.IO server; each `to`/`in` returns an emitter we can inspect
  const emitted: { rooms: string | string[]; event: string; args: unknown[] }[] = [];
  const operator = (rooms: string | string[]) => ({
    emit: (event: string, ...args: unknown[]) => void emitted.push({ rooms, event, args }),
    socketsJoin: vi.fn<AnyFunction>(),
  });
  const server = {
    to: vi.fn<typeof operator>(operator),
    in: vi.fn<typeof operator>(operator),
    use: vi.fn<AnyFunction>(),
  };
  Object.assign(gateway, { server });
  return { gateway, server, emitted, presence };
}

function fakeSocket(
  overrides: Partial<{ userId: string; rooms: string[]; chatIds: string[] }> = {},
  emitted: { rooms: string | string[]; event: string; args: unknown[] }[] = [],
) {
  const typingEmit = vi.fn<AnyFunction>();
  const socket = {
    id: 'socket-1',
    data: {
      userId: overrides.userId ?? ALICE,
      username: 'alice',
      exp: Date.now() / 1000 + 3600,
      chatIds: overrides.chatIds ?? [],
    },
    rooms: new Set(overrides.rooms ?? []),
    join: vi.fn<AnyFunction>(),
    use: vi.fn<AnyFunction>(),
    on: vi.fn<AnyFunction>(),
    // `socket.to(rooms)` reaches the rooms WITHOUT this socket itself
    to: vi.fn<(rooms: string | string[]) => unknown>((rooms) => ({
      volatile: { emit: typingEmit },
      emit: (event: string, ...args: unknown[]) => void emitted.push({ rooms, event, args }),
    })),
  };
  return { socket: socket as unknown as AppSocket & typeof socket, typingEmit };
}

beforeEach(() => vi.clearAllMocks());

async function authenticate(auth: unknown) {
  const { gateway, server } = makeGateway();
  gateway.afterInit(server as never);
  const middleware = server.use.mock.calls[0]![0] as (
    socket: unknown,
    next: (error?: Error) => void,
  ) => Promise<void>;
  const socket = { handshake: { auth }, data: {} as Record<string, unknown> };
  const next = vi.fn<(error?: Error) => void>();
  await middleware(socket, next);
  return { socket, next };
}

describe('handshake authentication', () => {
  it('accepts a valid token and remembers who the socket is and which chats it is in', async () => {
    chats.getMemberChatIds.mockResolvedValue([CHAT]);
    const { socket, next } = await authenticate({
      token: await jwt.signAsync({ sub: ALICE, username: 'alice' }),
    });

    expect(next).toHaveBeenCalledWith(); // no error
    expect(socket.data).toMatchObject({ userId: ALICE, username: 'alice', chatIds: [CHAT] });
    expect(socket.data.exp).toEqual(expect.any(Number));
    expect(chats.getMemberChatIds).toHaveBeenCalledWith(ALICE);
  });

  it.each([
    ['no auth payload at all', undefined],
    ['no token', {}],
    ['garbage', { token: 'not.a.jwt' }],
    ['a token that is not a string', { token: 12345 }],
  ])('rejects %s with "Unauthorized"', async (_name, auth) => {
    const { next } = await authenticate(auth);
    expect(next.mock.calls[0]![0]!.message).toBe('Unauthorized');
    expect(chats.getMemberChatIds).not.toHaveBeenCalled();
  });

  it('rejects a validly signed token that has no subject', async () => {
    const { next } = await authenticate({ token: await jwt.signAsync({ username: 'x' }) });
    expect(next.mock.calls[0]![0]!.message).toBe('Unauthorized');
  });

  it('reports a server problem as such instead of calling the user unauthorized', async () => {
    chats.getMemberChatIds.mockRejectedValue(new Error('connection refused to db.internal:5432'));
    const { next } = await authenticate({
      token: await jwt.signAsync({ sub: ALICE, username: 'alice' }),
    });
    expect(next.mock.calls[0]![0]!.message).toBe('Server error'); // and not the internal details
  });
});

describe('connecting and disconnecting', () => {
  it('puts the socket in its own room and in the room of every chat it belongs to, at once', () => {
    const { gateway } = makeGateway();
    const { socket } = fakeSocket({ chatIds: [CHAT, 'other'] });
    gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith([`user:${ALICE}`, `chat:${CHAT}`, 'chat:other']);
    expect(socket.use).toHaveBeenCalledTimes(1); // the packet guard
  });

  it('tells the others in the user’s chats that they came online, once however many tabs they open', () => {
    const { gateway, emitted } = makeGateway();
    gateway.handleConnection(fakeSocket({ chatIds: [CHAT] }, emitted).socket);
    gateway.handleConnection(fakeSocket({ chatIds: [CHAT] }, emitted).socket);
    expect(emitted).toEqual([
      {
        rooms: [`chat:${CHAT}`],
        event: 'presence:changed',
        args: [{ userId: ALICE, isOnline: true }],
      },
    ]);
  });

  it('announces it from the connecting socket, so the user is not told about themselves', () => {
    const { gateway, server } = makeGateway();
    const { socket } = fakeSocket({ chatIds: [CHAT] });
    gateway.handleConnection(socket);
    expect(socket.to).toHaveBeenCalledWith([`chat:${CHAT}`]);
    expect(server.to).not.toHaveBeenCalled(); // `server.to` would include the socket itself
  });

  it('never broadcasts presence to everybody when the user is in no chat', () => {
    // Socket.IO treats `to([])` as "send to all sockets"
    const { gateway, server } = makeGateway();
    const { socket } = fakeSocket({ chatIds: [] });
    gateway.handleConnection(socket);
    expect(server.to).not.toHaveBeenCalled();
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('records the last-seen time and announces "offline" only once the grace period is over', async () => {
    const presence = new PresenceService(0);
    const { gateway, emitted } = makeGateway(presence);
    chats.getMemberChatIds.mockResolvedValue([CHAT]);
    const { socket } = fakeSocket({ chatIds: [CHAT] });
    gateway.handleConnection(socket);
    emitted.length = 0;

    gateway.handleDisconnect(socket);
    expect(emitted).toEqual([]); // still within the grace period
    await vi.waitFor(() => expect(emitted).toHaveLength(1));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: ALICE },
      data: { lastSeenAt: expect.any(Date) },
    });
    expect(emitted[0]).toEqual({
      rooms: [`chat:${CHAT}`],
      event: 'presence:changed',
      args: [{ userId: ALICE, isOnline: false }],
    });
  });
});

describe('commands', () => {
  const sendBody = { chatId: CHAT, clientId: CLIENT, content: 'hello' };

  it('answers an invalid payload with the first problem, without calling the service', async () => {
    const { gateway } = makeGateway();
    const { socket } = fakeSocket();
    expect(await gateway.send(socket, { chatId: CHAT, clientId: CLIENT })).toEqual({
      ok: false,
      error: 'Message cannot be empty',
    });
    expect(await gateway.send(socket, 'nonsense')).toMatchObject({ ok: false });
    expect(await gateway.send(socket, undefined)).toMatchObject({ ok: false });
    expect(messages.send).not.toHaveBeenCalled();
  });

  it('calls the service as the authenticated user and returns the result', async () => {
    const dto = { id: MESSAGE };
    messages.send.mockResolvedValue(dto);
    const { gateway } = makeGateway();
    const { socket } = fakeSocket();

    // a client that tries to write as somebody else
    const result = await gateway.send(socket, { ...sendBody, senderId: BOB, sender: { id: BOB } });
    expect(result).toEqual({ ok: true, data: dto });
    expect(messages.send).toHaveBeenCalledWith(ALICE, { ...sendBody, attachmentIds: [] }); // parsed input, own id
  });

  it('turns a service rejection into a readable error', async () => {
    messages.send.mockRejectedValue(new ForbiddenException('You are not a member of this chat'));
    const { gateway } = makeGateway();
    expect(await gateway.send(fakeSocket().socket, sendBody)).toEqual({
      ok: false,
      error: 'You are not a member of this chat',
    });
  });

  it('never leaks the details of an unexpected error', async () => {
    messages.send.mockRejectedValue(
      new Error('password authentication failed for user "chat" at db.internal'),
    );
    const { gateway } = makeGateway();
    expect(await gateway.send(fakeSocket().socket, sendBody)).toEqual({
      ok: false,
      error: 'Internal error',
    });
  });

  it('edit and delete work the same way', async () => {
    messages.edit.mockResolvedValue({ id: MESSAGE });
    messages.delete.mockResolvedValue(undefined);
    messages.delete.mockRejectedValueOnce(new NotFoundException('Message not found'));
    const { gateway } = makeGateway();
    const { socket } = fakeSocket();

    expect(await gateway.edit(socket, { messageId: MESSAGE, content: 'fixed' })).toEqual({
      ok: true,
      data: { id: MESSAGE },
    });
    expect(messages.edit).toHaveBeenCalledWith(ALICE, { messageId: MESSAGE, content: 'fixed' });
    expect(await gateway.edit(socket, { messageId: 'x', content: 'fixed' })).toMatchObject({
      ok: false,
    });

    expect(await gateway.remove(socket, { messageId: MESSAGE })).toEqual({
      ok: false,
      error: 'Message not found',
    });
    expect(await gateway.remove(socket, { messageId: MESSAGE })).toEqual({
      ok: true,
      data: undefined,
    });
  });
});

describe('read cursor', () => {
  it('moves the cursor of the authenticated user and sends no acknowledgement', async () => {
    chats.markRead.mockResolvedValue(undefined);
    const { gateway } = makeGateway();
    expect(await gateway.read(fakeSocket().socket, { chatId: CHAT, seq: 7 })).toBeUndefined();
    expect(chats.markRead).toHaveBeenCalledWith(ALICE, CHAT, 7);
  });

  it('ignores invalid payloads and survives a failing service', async () => {
    const { gateway } = makeGateway();
    const { socket } = fakeSocket();
    await gateway.read(socket, { chatId: 'x', seq: -1 });
    expect(chats.markRead).not.toHaveBeenCalled();

    chats.markRead.mockRejectedValue(new Error('boom'));
    await expect(gateway.read(socket, { chatId: CHAT, seq: 1 })).resolves.toBeUndefined();
  });
});

describe('typing', () => {
  it('is passed to the others in the room as a volatile event, with the name taken from the token', () => {
    const { gateway } = makeGateway();
    const { socket, typingEmit } = fakeSocket({ rooms: [`chat:${CHAT}`] });
    gateway.typing(socket, { chatId: CHAT, isTyping: true, username: 'mallory', userId: BOB });
    expect(socket.to).toHaveBeenCalledWith(`chat:${CHAT}`);
    expect(typingEmit).toHaveBeenCalledWith('typing', {
      chatId: CHAT,
      userId: ALICE,
      username: 'alice',
      isTyping: true,
    });
  });

  it('is dropped for a chat the socket is not in, and for invalid payloads', () => {
    const { gateway } = makeGateway();
    const { socket, typingEmit } = fakeSocket({ rooms: [`chat:${CHAT}`] });
    gateway.typing(socket, { chatId: '44444444-4444-4444-8444-444444444444', isTyping: true });
    gateway.typing(socket, { chatId: CHAT, isTyping: 'yes' });
    gateway.typing(socket, null);
    expect(typingEmit).not.toHaveBeenCalled();
  });
});

describe('domain events become broadcasts', () => {
  it('message events go to the room of their chat', () => {
    const { gateway, emitted } = makeGateway();
    const dto = { id: MESSAGE, chatId: CHAT } as never;
    gateway.onCreated(dto);
    gateway.onUpdated(dto);
    gateway.onDeleted({ chatId: CHAT, messageId: MESSAGE });
    gateway.onRead({ chatId: CHAT, userId: ALICE, seq: 3 });

    expect(emitted.map((e) => [e.rooms, e.event])).toEqual([
      [`chat:${CHAT}`, 'message:created'],
      [`chat:${CHAT}`, 'message:updated'],
      [`chat:${CHAT}`, 'message:deleted'],
      [`chat:${CHAT}`, 'chat:read'],
    ]);
    expect(emitted[3]!.args).toEqual([{ chatId: CHAT, userId: ALICE, seq: 3 }]);
  });

  it('new members: their open sockets join the chat room and are told to refetch their chat list', () => {
    const { gateway, server, emitted } = makeGateway();
    gateway.onMembersChanged({ chatId: CHAT, userIds: [ALICE, BOB] });
    const rooms = [`user:${ALICE}`, `user:${BOB}`];
    expect(server.in).toHaveBeenCalledWith(rooms);
    expect(emitted).toEqual([{ rooms, event: 'chat:changed', args: [{ chatId: CHAT }] }]);
  });

  it('does nothing for an empty member list (an empty room list would mean "everybody")', () => {
    const { gateway, server } = makeGateway();
    gateway.onMembersChanged({ chatId: CHAT, userIds: [] });
    expect(server.in).not.toHaveBeenCalled();
    expect(server.to).not.toHaveBeenCalled();
  });
});
