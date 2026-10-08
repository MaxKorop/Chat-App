import { chatDetailsSchema, chatSummarySchema } from '@chat/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { DomainEvents } from '../../common/domain-events';
import {
  addMessage,
  befriend,
  createDirectChat,
  createGroup,
  createTestApp,
  createUser,
  type TestApp,
} from '../../test/app';
import { ChatsService } from './chats.service';

let t: TestApp;
let emit: MockInstance<EventEmitter2['emit']>;
beforeEach(async () => {
  t = await createTestApp();
  emit = vi.spyOn(t.app.get(EventEmitter2), 'emit');
});
afterEach(() => t.app.close());

const MISSING = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const eventsOf = (name: string) =>
  emit.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);

describe('GET /api/chats', () => {
  it('lists my chats with a title: the group name, or the other person for a DM', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma, { username: 'bob' })];
    await createDirectChat(t.prisma, me, bob);
    await createGroup(t.prisma, me, [bob], { name: 'Study group' });
    await createGroup(t.prisma, bob, [], { name: 'Not mine' });

    const res = await t.http().get('/api/chats').set(t.auth(me)).expect(200);
    res.body.forEach((chat: unknown) => chatSummarySchema.parse(chat));
    expect(res.body.map((c: { title: string }) => c.title).toSorted()).toEqual([
      'Study group',
      'bob',
    ]);
    expect(res.body.every((c: { isMember: boolean }) => c.isMember)).toBe(true);
  });

  it('puts the chat with the newest message first, and chats without messages last', async () => {
    const me = await createUser(t.prisma);
    const [quiet, old, fresh] = [
      await createGroup(t.prisma, me, [], { name: 'quiet' }),
      await createGroup(t.prisma, me, [], { name: 'old' }),
      await createGroup(t.prisma, me, [], { name: 'fresh' }),
    ];
    await addMessage(t, old.id, me.id, 'first');
    await addMessage(t, fresh.id, me.id, 'second');
    void quiet;

    const res = await t.http().get('/api/chats').set(t.auth(me)).expect(200);
    expect(res.body.map((c: { title: string }) => c.title)).toEqual(['fresh', 'old', 'quiet']);
  });

  it('shows a decrypted preview of the last message, and a placeholder for attachment-only ones', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, me, [bob]);
    await addMessage(t, chat.id, bob.id, 'see you at 6');
    let list = (await t.http().get('/api/chats').set(t.auth(me)).expect(200)).body;
    expect(list[0].lastMessage).toMatchObject({ preview: 'see you at 6' });

    const photo = await addMessage(t, chat.id, bob.id, null);
    await t.prisma.attachment.create({
      data: {
        uploaderId: bob.id,
        messageId: photo.id,
        storageKey: `k/${photo.id}`,
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 1,
      },
    });
    list = (await t.http().get('/api/chats').set(t.auth(me)).expect(200)).body;
    expect(list[0].lastMessage.preview).toBe('📷 Photo');
  });

  it('truncates long previews', async () => {
    const me = await createUser(t.prisma);
    const chat = await createGroup(t.prisma, me);
    await addMessage(t, chat.id, me.id, 'x'.repeat(500));
    const list = (await t.http().get('/api/chats').set(t.auth(me)).expect(200)).body;
    expect(list[0].lastMessage.preview.length).toBeLessThanOrEqual(80);
  });

  it('counts unread messages from other people only, after my read cursor', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, me, [bob]);
    await addMessage(t, chat.id, bob.id, 'one');
    await addMessage(t, chat.id, me.id, 'my own message'); // never unread for me
    await addMessage(t, chat.id, bob.id, 'two');
    await addMessage(t, chat.id, bob.id, 'three');
    const unread = async () =>
      (await t.http().get('/api/chats').set(t.auth(me)).expect(200)).body[0].unreadCount;

    expect(await unread()).toBe(3);
    await t.prisma.chatMember.update({
      where: { chatId_userId: { chatId: chat.id, userId: me.id } },
      data: { lastReadSeq: 3 }, // read up to "two"
    });
    expect(await unread()).toBe(1);
  });

  it('shows a message from a deleted account', async () => {
    const [me, gone] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, me, [gone]);
    await addMessage(t, chat.id, gone.id, 'bye');
    await t.prisma.user.delete({ where: { id: gone.id } });
    const list = (await t.http().get('/api/chats').set(t.auth(me)).expect(200)).body;
    expect(list[0]).toMatchObject({ unreadCount: 1, lastMessage: { preview: 'bye' } });
  });

  it('requires authentication', async () => {
    await t.http().get('/api/chats').expect(401);
  });
});

describe('POST /api/chats (DIRECT)', () => {
  it('creates a chat between two friends and tells the realtime layer who is in it', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma, { username: 'bob' })];
    await befriend(t.prisma, me.id, bob.id);

    const res = await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'DIRECT', userId: bob.id })
      .expect(201);
    const chat = chatDetailsSchema.parse(res.body);
    expect(chat).toMatchObject({ type: 'DIRECT', title: 'bob', isMember: true });
    expect(chat.members.map((m) => m.userId).toSorted()).toEqual([me.id, bob.id].toSorted());
    expect(eventsOf(DomainEvents.ChatMembersChanged)).toEqual([
      { chatId: chat.id, userIds: expect.arrayContaining([me.id, bob.id]) },
    ]);
  });

  it('returns the existing chat instead of a duplicate, whoever asks (200, not 201)', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma)];
    await befriend(t.prisma, me.id, bob.id);
    const first = await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'DIRECT', userId: bob.id })
      .expect(201);
    const again = await t
      .http()
      .post('/api/chats')
      .set(t.auth(bob))
      .send({ type: 'DIRECT', userId: me.id })
      .expect(200);

    expect(again.body.id).toBe(first.body.id);
    expect(await t.prisma.chat.count()).toBe(1);
    expect(eventsOf(DomainEvents.ChatMembersChanged)).toHaveLength(1); // nothing new happened the second time
  });

  it('is limited to friends (403), never yourself (400), and real users (404)', async () => {
    const [me, stranger] = [await createUser(t.prisma), await createUser(t.prisma)];
    await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'DIRECT', userId: stranger.id })
      .expect(403);
    await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'DIRECT', userId: me.id })
      .expect(400);
    await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'DIRECT', userId: MISSING })
      .expect(404);
    expect(await t.prisma.chat.count()).toBe(0);
  });

  it('rejects invalid bodies with 400', async () => {
    const me = await createUser(t.prisma);
    await t.http().post('/api/chats').set(t.auth(me)).send({ type: 'DIRECT' }).expect(400);
    await t.http().post('/api/chats').set(t.auth(me)).send({ type: 'CHANNEL' }).expect(400);
  });
});

describe('POST /api/chats (GROUP)', () => {
  it('makes the creator the owner and adds the chosen friends as members', async () => {
    const [me, a, b] = [
      await createUser(t.prisma),
      await createUser(t.prisma),
      await createUser(t.prisma),
    ];
    await befriend(t.prisma, me.id, a.id);
    await befriend(t.prisma, me.id, b.id);

    const res = await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({
        type: 'GROUP',
        name: '  Study group ',
        description: 'exam prep',
        isPublic: true,
        memberIds: [a.id, b.id],
      })
      .expect(201);
    const chat = chatDetailsSchema.parse(res.body);

    expect(chat).toMatchObject({
      type: 'GROUP',
      title: 'Study group',
      description: 'exam prep',
      isPublic: true,
    });
    expect(chat.members.find((m) => m.userId === me.id)?.role).toBe('OWNER');
    expect(chat.members.filter((m) => m.role === 'MEMBER')).toHaveLength(2);
    expect(chat.members.every((m) => m.lastReadSeq === 0)).toBe(true);
    expect(eventsOf(DomainEvents.ChatMembersChanged)[0]).toMatchObject({ chatId: chat.id });
  });

  it('ignores duplicates and the creator in the member list', async () => {
    const [me, a] = [await createUser(t.prisma), await createUser(t.prisma)];
    await befriend(t.prisma, me.id, a.id);
    const res = await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'GROUP', name: 'Dupes', isPublic: false, memberIds: [a.id, a.id, me.id] })
      .expect(201);
    expect(res.body.members).toHaveLength(2);
  });

  it('allows only friends as members (403) and creates nothing otherwise', async () => {
    const [me, stranger] = [await createUser(t.prisma), await createUser(t.prisma)];
    await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'GROUP', name: 'Nope', isPublic: false, memberIds: [stranger.id] })
      .expect(403);
    expect(await t.prisma.chat.count()).toBe(0);
  });

  it('answers 400 for a too-short name', async () => {
    const me = await createUser(t.prisma);
    await t
      .http()
      .post('/api/chats')
      .set(t.auth(me))
      .send({ type: 'GROUP', name: 'ab', isPublic: false, memberIds: [] })
      .expect(400);
  });
});

describe('GET /api/chats/search', () => {
  it('finds public groups by part of the name, ignoring case, and says whether I am in them', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const joined = await createGroup(t.prisma, owner, [me], {
      name: 'TypeScript fans',
      isPublic: true,
    });
    await createGroup(t.prisma, owner, [], { name: 'Rust fans', isPublic: true });
    void joined;

    const res = await t
      .http()
      .get('/api/chats/search')
      .query({ q: 'script' })
      .set(t.auth(me))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(chatSummarySchema.parse(res.body[0])).toMatchObject({
      title: 'TypeScript fans',
      isMember: true,
    });
    const other = await t
      .http()
      .get('/api/chats/search')
      .query({ q: 'rust' })
      .set(t.auth(me))
      .expect(200);
    expect(other.body[0].isMember).toBe(false);
  });

  it('never returns private groups or direct chats', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    await createGroup(t.prisma, owner, [], { name: 'secret club', isPublic: false });
    await createDirectChat(t.prisma, me, owner);
    const res = await t
      .http()
      .get('/api/chats/search')
      .query({ q: 'secret' })
      .set(t.auth(me))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('treats wildcards in the query as plain text, and a blank query as nothing', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    await createGroup(t.prisma, owner, [], { name: 'a_c group', isPublic: true });
    await createGroup(t.prisma, owner, [], { name: 'abc group', isPublic: true });
    const search = async (q: string) =>
      (await t.http().get('/api/chats/search').query({ q }).set(t.auth(me)).expect(200)).body.map(
        (c: { title: string }) => c.title,
      );
    expect(await search('a_c')).toEqual(['a_c group']);
    expect(await search('%')).toEqual([]);
    expect(await search('   ')).toEqual([]);
  });
});

describe('GET /api/chats/:id', () => {
  it('shows members with their read cursors to members', async () => {
    const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma, { username: 'bob' })];
    const chat = await createGroup(t.prisma, me, [bob], { description: 'about us' });
    await t.prisma.chatMember.update({
      where: { chatId_userId: { chatId: chat.id, userId: bob.id } },
      data: { lastReadSeq: 4 },
    });

    const res = await t.http().get(`/api/chats/${chat.id}`).set(t.auth(me)).expect(200);
    const details = chatDetailsSchema.parse(res.body);
    expect(details.description).toBe('about us');
    expect(details.members.find((m) => m.username === 'bob')).toMatchObject({
      role: 'MEMBER',
      lastReadSeq: 4,
    });
  });

  it('lets non-members preview a public group, but without members or messages', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, owner, [], { isPublic: true });
    await addMessage(t, chat.id, owner.id, 'members only');

    const res = await t.http().get(`/api/chats/${chat.id}`).set(t.auth(me)).expect(200);
    expect(chatDetailsSchema.parse(res.body)).toMatchObject({
      isMember: false,
      members: [],
      lastMessage: null,
      unreadCount: 0,
    });
  });

  it('refuses non-members of private chats (403), unknown chats (404) and malformed ids (400)', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const priv = await createGroup(t.prisma, owner, [], { isPublic: false });
    await t.http().get(`/api/chats/${priv.id}`).set(t.auth(me)).expect(403);
    await t.http().get(`/api/chats/${MISSING}`).set(t.auth(me)).expect(404);
    await t.http().get('/api/chats/nope').set(t.auth(me)).expect(400);
  });
});

describe('POST /api/chats/:id/join', () => {
  it('joins a public group with the read cursor at the end, so old history is not "unread"', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, owner, [], { isPublic: true });
    await addMessage(t, chat.id, owner.id, 'before you');
    await addMessage(t, chat.id, owner.id, 'before you too');

    const res = await t.http().post(`/api/chats/${chat.id}/join`).set(t.auth(me)).expect(201);
    const details = chatDetailsSchema.parse(res.body);
    expect(details).toMatchObject({ isMember: true, unreadCount: 0 });
    expect(details.members.find((m) => m.userId === me.id)).toMatchObject({
      role: 'MEMBER',
      lastReadSeq: 2,
    });
    expect(eventsOf(DomainEvents.ChatMembersChanged)).toEqual([
      { chatId: chat.id, userIds: [me.id] },
    ]);
  });

  it('is idempotent: joining again keeps the read cursor and announces nothing', async () => {
    const [me, owner] = [await createUser(t.prisma), await createUser(t.prisma)];
    const chat = await createGroup(t.prisma, owner, [], { isPublic: true });
    await t.http().post(`/api/chats/${chat.id}/join`).set(t.auth(me)).expect(201);
    await addMessage(t, chat.id, owner.id, 'new');
    emit.mockClear();

    await t.http().post(`/api/chats/${chat.id}/join`).set(t.auth(me)).expect(201);
    const member = await t.prisma.chatMember.findUniqueOrThrow({
      where: { chatId_userId: { chatId: chat.id, userId: me.id } },
    });
    expect(member.lastReadSeq).toBe(0); // the new message is still unread
    expect(eventsOf(DomainEvents.ChatMembersChanged)).toEqual([]);
    expect(await t.prisma.chatMember.count({ where: { chatId: chat.id } })).toBe(2);
  });

  it('refuses private groups and direct chats (403) and unknown chats (404)', async () => {
    const [me, owner, other] = [
      await createUser(t.prisma),
      await createUser(t.prisma),
      await createUser(t.prisma),
    ];
    const priv = await createGroup(t.prisma, owner, [], { isPublic: false });
    const dm = await createDirectChat(t.prisma, owner, other);
    await t.http().post(`/api/chats/${priv.id}/join`).set(t.auth(me)).expect(403);
    await t.http().post(`/api/chats/${dm.id}/join`).set(t.auth(me)).expect(403);
    await t.http().post(`/api/chats/${MISSING}/join`).set(t.auth(me)).expect(404);
  });
});

const cursor = (chatId: string, userId: string) =>
  t.prisma.chatMember
    .findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } })
    .then((m) => m.lastReadSeq);

async function chatWithMessages(count: number) {
  const [me, bob] = [await createUser(t.prisma), await createUser(t.prisma)];
  const chat = await createGroup(t.prisma, me, [bob]);
  for (let i = 0; i < count; i += 1) await addMessage(t, chat.id, bob.id, `m${i}`);
  return { me, bob, chat };
}

describe('ChatsService (used by the realtime layer)', () => {
  describe('assertMember / getMemberChatIds', () => {
    it('returns the membership, or throws 403 for outsiders', async () => {
      const { me, chat } = await chatWithMessages(0);
      const outsider = await createUser(t.prisma);
      const service = t.app.get(ChatsService);
      await expect(service.assertMember(chat.id, me.id)).resolves.toMatchObject({ role: 'OWNER' });
      await expect(service.assertMember(chat.id, outsider.id)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('lists the ids of all chats a user is in', async () => {
      const { me, chat } = await chatWithMessages(0);
      const other = await createGroup(t.prisma, me);
      expect((await t.app.get(ChatsService).getMemberChatIds(me.id)).toSorted()).toEqual(
        [chat.id, other.id].toSorted(),
      );
    });
  });

  describe('markRead', () => {
    it('moves the cursor forward and announces it', async () => {
      const { me, chat } = await chatWithMessages(5);
      await t.app.get(ChatsService).markRead(me.id, chat.id, 3);
      expect(await cursor(chat.id, me.id)).toBe(3);
      expect(eventsOf(DomainEvents.ChatRead)).toEqual([{ chatId: chat.id, userId: me.id, seq: 3 }]);
    });

    it('never moves backwards: an older or repeated mark is a silent no-op', async () => {
      const { me, chat } = await chatWithMessages(5);
      const service = t.app.get(ChatsService);
      await service.markRead(me.id, chat.id, 4);
      emit.mockClear();
      await service.markRead(me.id, chat.id, 2);
      await service.markRead(me.id, chat.id, 4);
      expect(await cursor(chat.id, me.id)).toBe(4);
      expect(eventsOf(DomainEvents.ChatRead)).toEqual([]);
    });

    it('cannot read the future: the cursor stops at the last message', async () => {
      const { me, chat } = await chatWithMessages(3);
      await t.app.get(ChatsService).markRead(me.id, chat.id, 999);
      expect(await cursor(chat.id, me.id)).toBe(3);
    });

    it('stays correct when marks arrive at the same time, in any order', async () => {
      const { me, chat } = await chatWithMessages(10);
      const service = t.app.get(ChatsService);
      await Promise.all([8, 3, 10, 5, 1, 7].map((seq) => service.markRead(me.id, chat.id, seq)));
      expect(await cursor(chat.id, me.id)).toBe(10);
    });

    it('does nothing for people who are not in the chat, and 404s for unknown chats', async () => {
      const { chat } = await chatWithMessages(3);
      const outsider = await createUser(t.prisma);
      await t.app.get(ChatsService).markRead(outsider.id, chat.id, 3);
      expect(await t.prisma.chatMember.count({ where: { userId: outsider.id } })).toBe(0);
      expect(eventsOf(DomainEvents.ChatRead)).toEqual([]);
      await expect(t.app.get(ChatsService).markRead(outsider.id, MISSING, 1)).rejects.toMatchObject(
        { status: 404 },
      );
    });
  });
});
