import { randomUUID } from 'node:crypto';

import { messageSchema } from '@chat/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addMessage,
  befriend,
  createGroup,
  createTestApp,
  createUser,
  type TestApp,
} from '../../test/app';
import { disconnectReason, expectNoEvent, nextEvent, TestClients } from '../../test/realtime';

let t: TestApp;
let clients: TestClients;
let url: string;
beforeEach(async () => {
  t = await createTestApp({ presenceGraceMs: 150 });
  url = await t.listen();
  clients = new TestClients(url, t);
});
afterEach(async () => {
  clients.closeAll();
  await t.app.close();
});

const sendInput = (chatId: string, patch: Record<string, unknown> = {}) => ({
  chatId,
  clientId: randomUUID(),
  content: 'hello',
  attachmentIds: [] as string[],
  ...patch,
});
async function aliceAndBobInAGroup() {
  const [alice, bob] = [
    await createUser(t.prisma, { username: 'alice' }),
    await createUser(t.prisma, { username: 'bob' }),
  ];
  const chat = await createGroup(t.prisma, alice, [bob]);
  return { alice, bob, chat };
}

describe('connecting', () => {
  it('accepts a valid token and marks the user as online', async () => {
    const user = await createUser(t.prisma);
    await clients.connect(user);
    const res = await t.http().get(`/api/users/${user.id}`).set(t.auth(user)).expect(200);
    expect(res.body.isOnline).toBe(true);
  });

  it.each([
    ['no token', {}],
    ['a garbage token', { auth: { token: 'garbage' } }],
    [
      'a token for a different secret',
      { auth: { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid' } },
    ],
  ])('refuses %s', async (_name, options) => {
    expect(await clients.refused(options)).toBe('Unauthorized');
  });

  it('refuses an expired token', async () => {
    const user = await createUser(t.prisma);
    const expired = t.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: -10 });
    expect(await clients.refused({ auth: { token: expired } })).toBe('Unauthorized');
  });

  it('does not accept the token from the URL, only from the handshake payload', async () => {
    const user = await createUser(t.prisma);
    const token = t.jwt.sign({ sub: user.id, username: user.username });
    expect(await clients.refused({ query: { token } })).toBe('Unauthorized');
  });

  it('does not accept the client-supplied identity the old app trusted', async () => {
    const user = await createUser(t.prisma);
    expect(await clients.refused({ query: { user: JSON.stringify(user) } })).toBe('Unauthorized');
  });

  it('only speaks WebSocket: long-polling is switched off', async () => {
    const user = await createUser(t.prisma);
    const token = t.jwt.sign({ sub: user.id, username: user.username });
    expect(await clients.refused({ auth: { token }, transports: ['polling'] })).toMatch(/.+/);
  });
});

describe('sending messages', () => {
  it('acknowledges the sender and delivers the message to every member of the chat in real time', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const aliceHears = nextEvent(forAlice, 'message:created');
    const bobHears = nextEvent(forBob, 'message:created');

    const ack = await forAlice.emitWithAck(
      'message:send',
      sendInput(chat.id, { content: 'hi bob' }),
    );
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(messageSchema.parse(ack.data)).toMatchObject({
      content: 'hi bob',
      seq: 1,
      sender: { id: alice.id, username: 'alice' },
    });

    expect(await bobHears).toEqual(ack.data);
    expect(await aliceHears).toEqual(ack.data); // the sender also gets the broadcast; clients de-duplicate by id
  });

  it('does not deliver it to people who are not in the chat', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    const outsider = await createUser(t.prisma);
    const [forAlice, forOutsider] = [await clients.connect(alice), await clients.connect(outsider)];
    const silent = expectNoEvent(forOutsider, 'message:created');

    await forAlice.emitWithAck('message:send', sendInput(chat.id));
    await silent;
  });

  it('is only possible in chats the sender belongs to, and says why', async () => {
    const { chat } = await aliceAndBobInAGroup();
    const outsider = await createUser(t.prisma);
    const socket = await clients.connect(outsider);

    const ack = await socket.emitWithAck('message:send', sendInput(chat.id));
    expect(ack).toEqual({ ok: false, error: 'You are not a member of this chat' });
    expect(await t.prisma.message.count()).toBe(0);
  });

  it('ignores any sender the client claims: the message is always from the authenticated user', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const socket = await clients.connect(alice);
    const ack = await socket.emitWithAck('message:send', {
      ...sendInput(chat.id),
      senderId: bob.id,
      sender: { id: bob.id, username: 'bob' },
    } as never);
    expect(ack.ok && ack.data.sender).toEqual({ id: alice.id, username: 'alice' });
  });

  it('rejects an invalid payload with a readable error and keeps working afterwards', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    const socket = await clients.connect(alice);
    expect(
      await socket.emitWithAck('message:send', {
        chatId: chat.id,
        clientId: randomUUID(),
      } as never),
    ).toEqual({ ok: false, error: 'Message cannot be empty' });
    expect(await socket.emitWithAck('message:send', 'nonsense' as never)).toMatchObject({
      ok: false,
    });
    expect((await socket.emitWithAck('message:send', sendInput(chat.id))).ok).toBe(true);
  });

  it('is idempotent over the wire: a retry returns the same message and is broadcast once', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const received: string[] = [];
    forBob.on('message:created', (m) => void received.push(m.id));
    const input = sendInput(chat.id);

    const first = await forAlice.emitWithAck('message:send', input);
    const retry = await forAlice.emitWithAck('message:send', input);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(retry).toEqual(first);
    expect(received).toHaveLength(1);
    expect(await t.prisma.message.count()).toBe(1);
  });

  it('shows messages to a user who connected after the chat already existed', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const forAlice = await clients.connect(alice);
    const forBob = await clients.connect(bob);
    const heard = nextEvent(forBob, 'message:created');
    await forAlice.emitWithAck('message:send', sendInput(chat.id, { content: 'late' }));
    expect((await heard).content).toBe('late');
  });
});

describe('editing and deleting', () => {
  it('edit: acknowledges the author and tells the room; others may not edit', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const sent = await forAlice.emitWithAck(
      'message:send',
      sendInput(chat.id, { content: 'typo' }),
    );
    if (!sent.ok) throw new Error('setup failed');

    expect(
      await forBob.emitWithAck('message:edit', { messageId: sent.data.id, content: 'hijack' }),
    ).toEqual({ ok: false, error: 'You can only edit your own messages' });

    const bobHears = nextEvent(forBob, 'message:updated');
    const ack = await forAlice.emitWithAck('message:edit', {
      messageId: sent.data.id,
      content: 'fixed',
    });
    expect(ack.ok && ack.data.content).toBe('fixed');
    expect(await bobHears).toMatchObject({ id: sent.data.id, content: 'fixed' });
    expect((await bobHears).editedAt).not.toBeNull();
  });

  it('delete: removes the message and tells the room; the group owner may delete others’ messages', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup(); // alice owns the group
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const sent = await forBob.emitWithAck('message:send', sendInput(chat.id));
    if (!sent.ok) throw new Error('setup failed');

    const bobHears = nextEvent(forBob, 'message:deleted');
    expect(await forAlice.emitWithAck('message:delete', { messageId: sent.data.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await bobHears).toEqual({ chatId: chat.id, messageId: sent.data.id });
    expect(await t.prisma.message.count()).toBe(0);
  });

  it('delete: a plain member cannot delete someone else’s message', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const sent = await forAlice.emitWithAck('message:send', sendInput(chat.id));
    if (!sent.ok) throw new Error('setup failed');
    expect((await forBob.emitWithAck('message:delete', { messageId: sent.data.id })).ok).toBe(
      false,
    );
    expect(await t.prisma.message.count()).toBe(1);
  });
});

describe('read cursors', () => {
  it('moves the cursor, tells the room, and ignores marks that go backwards', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    for (let i = 0; i < 5; i += 1) await addMessage(t, chat.id, alice.id, `m${i}`);
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];

    const aliceHears = nextEvent(forAlice, 'chat:read');
    forBob.emit('chat:read', { chatId: chat.id, seq: 4 });
    expect(await aliceHears).toEqual({ chatId: chat.id, userId: bob.id, seq: 4 });

    const silent = expectNoEvent(forAlice, 'chat:read');
    forBob.emit('chat:read', { chatId: chat.id, seq: 2 });
    await silent;
    const member = await t.prisma.chatMember.findUniqueOrThrow({
      where: { chatId_userId: { chatId: chat.id, userId: bob.id } },
    });
    expect(member.lastReadSeq).toBe(4);
  });

  it('cannot be used by someone outside the chat', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    await addMessage(t, chat.id, alice.id, 'hi');
    const outsider = await createUser(t.prisma);
    const [forAlice, forOutsider] = [await clients.connect(alice), await clients.connect(outsider)];
    const silent = expectNoEvent(forAlice, 'chat:read');
    forOutsider.emit('chat:read', { chatId: chat.id, seq: 1 });
    await silent;
    expect(await t.prisma.chatMember.count({ where: { userId: outsider.id } })).toBe(0);
  });
});

describe('typing', () => {
  it('reaches the others in the chat but not the typist', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const bobHears = nextEvent(forBob, 'typing');
    const aliceSilent = expectNoEvent(forAlice, 'typing');

    forAlice.emit('typing', { chatId: chat.id, isTyping: true });
    expect(await bobHears).toEqual({
      chatId: chat.id,
      userId: alice.id,
      username: 'alice',
      isTyping: true,
    });
    await aliceSilent;
  });

  it('does not reach other chats, and cannot be sent into a chat the sender is not in', async () => {
    const { alice, bob, chat } = await aliceAndBobInAGroup();
    const elsewhere = await createGroup(t.prisma, bob);
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const silent = expectNoEvent(forBob, 'typing');

    forAlice.emit('typing', { chatId: elsewhere.id, isTyping: true }); // alice is not in that chat
    forAlice.emit('typing', { chatId: 'not-a-uuid', isTyping: true } as never);
    void chat;
    await silent;
  });
});

describe('chats created or joined while connected', () => {
  it('a new direct chat works at once, without reconnecting', async () => {
    const [alice, bob] = [
      await createUser(t.prisma, { username: 'alice' }),
      await createUser(t.prisma, { username: 'bob' }),
    ];
    await befriend(t.prisma, alice.id, bob.id);
    const [forAlice, forBob] = [await clients.connect(alice), await clients.connect(bob)];
    const told = nextEvent(forBob, 'chat:changed');

    const created = await t
      .http()
      .post('/api/chats')
      .set(t.auth(alice))
      .send({ type: 'DIRECT', userId: bob.id })
      .expect(201);
    expect(await told).toEqual({ chatId: created.body.id });

    const heard = nextEvent(forBob, 'message:created');
    await forAlice.emitWithAck('message:send', sendInput(created.body.id, { content: 'first!' }));
    expect((await heard).content).toBe('first!');
  });

  it('joining a public group starts delivery to the already open socket', async () => {
    const [owner, joiner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, owner, [], { isPublic: true });
    const [forOwner, forJoiner] = [await clients.connect(owner), await clients.connect(joiner)];

    const silent = expectNoEvent(forJoiner, 'message:created');
    await forOwner.emitWithAck('message:send', sendInput(chat.id, { content: 'before joining' }));
    await silent; // not a member yet

    const told = nextEvent(forJoiner, 'chat:changed');
    await t.http().post(`/api/chats/${chat.id}/join`).set(t.auth(joiner)).expect(201);
    await told;
    const heard = nextEvent(forJoiner, 'message:created');
    await forOwner.emitWithAck('message:send', sendInput(chat.id, { content: 'after joining' }));
    expect((await heard).content).toBe('after joining');
  });
});

describe('presence', () => {
  it('tells people who share a chat when someone comes online and, after the grace period, when they leave', async () => {
    const { alice, bob } = await aliceAndBobInAGroup();
    const forBob = await clients.connect(bob);

    const online = nextEvent(forBob, 'presence:changed');
    const forAlice = await clients.connect(alice);
    expect(await online).toEqual({ userId: alice.id, isOnline: true });

    const offline = nextEvent(forBob, 'presence:changed');
    forAlice.disconnect();
    expect(await offline).toEqual({ userId: alice.id, isOnline: false });
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).lastSeenAt.getTime(),
    ).toBeGreaterThan(Date.now() - 5_000);
  });

  it('is never sent to the user it is about', async () => {
    const { bob } = await aliceAndBobInAGroup();
    const seen: unknown[] = [];
    // registered before connecting, so even the very first packet cannot be missed
    await clients.connect(bob, {
      before: (socket) => socket.on('presence:changed', (event) => void seen.push(event)),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(seen).toEqual([]);
  });

  it('is not sent to people who share no chat with the user', async () => {
    const { alice } = await aliceAndBobInAGroup();
    const stranger = await createUser(t.prisma);
    const forStranger = await clients.connect(stranger);
    const silent = expectNoEvent(forStranger, 'presence:changed');
    await clients.connect(alice);
    await silent;
  });

  it('a second tab does not announce "online" again, and closing one tab does not go offline', async () => {
    const { alice, bob } = await aliceAndBobInAGroup();
    const forBob = await clients.connect(bob);
    const first = nextEvent(forBob, 'presence:changed');
    const tab1 = await clients.connect(alice);
    await first;

    const silent = expectNoEvent(forBob, 'presence:changed', 500);
    await clients.connect(alice); // tab 2
    tab1.disconnect();
    await silent;
    expect(
      (await t.http().get(`/api/users/${alice.id}`).set(t.auth(bob)).expect(200)).body.isOnline,
    ).toBe(true);
  });

  it('a quick reconnect (page refresh) never shows as offline', async () => {
    // A reconnect needs a handshake, a token check and a database query. Give it a grace period it
    // can never miss, even on a busy machine, then wait past that period to prove nothing fires.
    const GRACE = 1_000;
    clients.closeAll();
    await t.app.close();
    t = await createTestApp({ presenceGraceMs: GRACE });
    clients = new TestClients(await t.listen(), t);
    const { alice, bob } = await aliceAndBobInAGroup();

    const forBob = await clients.connect(bob);
    const cameOnline = nextEvent(forBob, 'presence:changed');
    const tab = await clients.connect(alice);
    await cameOnline; // the first, genuine "online"

    const silent = expectNoEvent(forBob, 'presence:changed', GRACE + 600);
    tab.disconnect();
    await clients.connect(alice); // the refreshed page
    await silent;
    expect(
      (await t.http().get(`/api/users/${alice.id}`).set(t.auth(bob)).expect(200)).body.isOnline,
    ).toBe(true);
  });
});

describe('protecting the server', () => {
  it('stops answering a socket that sends more than 30 events in 10 seconds', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    const socket = await clients.connect(alice);
    for (let i = 0; i < 30; i += 1)
      expect(
        (await socket.emitWithAck('message:send', sendInput(chat.id, { content: `m${i}` }))).ok,
      ).toBe(true);

    await expect(
      socket.timeout(500).emitWithAck('message:send', sendInput(chat.id)),
    ).rejects.toThrow(/timed out/i); // no acknowledgement ever comes
    expect(await t.prisma.message.count()).toBe(30);
  });

  it('disconnects a socket whose token expires while it is open', async () => {
    const user = await createUser(t.prisma);
    const token = t.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: 2 });
    const socket = await clients.connect(user, { token });
    const { exp } = t.jwt.decode(token) as { exp: number };
    await new Promise((resolve) => setTimeout(resolve, exp * 1000 - Date.now() + 100));

    const closed = disconnectReason(socket);
    socket.emit('typing', { chatId: randomUUID(), isTyping: true });
    expect(await closed).toBe('io server disconnect');
  });

  it('drops a connection that sends an oversized packet (files go through REST, not the socket)', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    const socket = await clients.connect(alice);
    const closed = disconnectReason(socket);
    socket.emit(
      'message:send',
      sendInput(chat.id, { content: 'x'.repeat(200_000) }),
      () => undefined,
    );
    await closed;
    expect(await t.prisma.message.count()).toBe(0);
  });

  it('ignores events it does not know and keeps serving the connection', async () => {
    const { alice, chat } = await aliceAndBobInAGroup();
    const socket = await clients.connect(alice);
    (socket as { emit: (event: string, ...args: unknown[]) => void }).emit('join', chat.id);
    (socket as { emit: (event: string, ...args: unknown[]) => void }).emit('chat:join', {
      chatId: chat.id,
    });
    expect((await socket.emitWithAck('message:send', sendInput(chat.id))).ok).toBe(true);
  });
});
