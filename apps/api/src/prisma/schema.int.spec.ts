import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import { createTestPrisma, resetDb } from '../test/db';

const prisma = createTestPrisma();

let counter = 0;
const makeUser = (overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) => {
  counter += 1;
  return prisma.user.create({
    data: {
      username: `user${counter}`,
      email: `user${counter}@example.com`,
      passwordHash: 'hash',
      ...overrides,
    },
  });
};
const makeChat = (overrides: Partial<Prisma.ChatUncheckedCreateInput> = {}) =>
  prisma.chat.create({ data: { type: 'GROUP', name: 'group', ...overrides } });
const makeAttachment = (
  uploaderId: string,
  overrides: Partial<Prisma.AttachmentUncheckedCreateInput> = {},
) =>
  prisma.attachment.create({
    data: {
      uploaderId,
      storageKey: `attachments/${uploaderId}/${randomUUID()}.png`,
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: 1234,
      ...overrides,
    },
  });

const makeMessage = async (
  chatId: string,
  seq: number,
  overrides: Partial<Prisma.MessageUncheckedCreateInput> = {},
) => prisma.message.create({ data: { chatId, seq, ...overrides } });

/** Prisma reports unique violations as P2002; this makes the intent of the tests readable. */
const expectUniqueViolation = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ code: 'P2002' });

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe('tables', () => {
  it('uses snake_case table names', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name <> '_prisma_migrations'
      order by table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'attachments',
      'chat_members',
      'chats',
      'friendships',
      'messages',
      'users',
    ]);
  });

  it('is in sync with the migrations (no schema drift)', () => {
    // exit code 0 = no differences, 2 = the database differs from schema.prisma
    expect(() =>
      execFileSync(
        'pnpm',
        [
          'exec',
          'prisma',
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          'prisma/schema.prisma',
          '--exit-code',
        ],
        { env: process.env, stdio: 'pipe' },
      ),
    ).not.toThrow();
  });
});

describe('users', () => {
  it('has sensible defaults', async () => {
    const user = await makeUser();
    expect(user).toMatchObject({
      about: '',
      hideLastSeen: false,
      hideInSearch: false,
      allowFriendRequests: true,
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.lastSeenAt).toBeInstanceOf(Date);
  });

  it('keeps usernames and e-mails unique', async () => {
    await makeUser({ username: 'alice', email: 'alice@example.com' });
    await expectUniqueViolation(makeUser({ username: 'alice' }));
    await expectUniqueViolation(makeUser({ email: 'alice@example.com' }));
  });

  it('rejects a username longer than 25 characters at the database level', async () => {
    await expect(makeUser({ username: 'x'.repeat(26) })).rejects.toThrow(/too long/i);
  });
});

describe('friendships', () => {
  it('has one row per direction and no duplicates', async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    await prisma.friendship.create({ data: { userId: a.id, friendId: b.id } });
    await prisma.friendship.create({ data: { userId: b.id, friendId: a.id } });
    await expectUniqueViolation(
      prisma.friendship.create({ data: { userId: a.id, friendId: b.id } }),
    );
  });

  it('disappears in both directions when a user is deleted', async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    await prisma.friendship.createMany({
      data: [
        { userId: a.id, friendId: b.id },
        { userId: b.id, friendId: a.id },
      ],
    });
    await prisma.user.delete({ where: { id: a.id } });
    expect(await prisma.friendship.count()).toBe(0);
  });
});

describe('chats', () => {
  it('starts with an empty message counter and private visibility', async () => {
    const chat = await makeChat();
    expect(chat).toMatchObject({ lastSeq: 0, isPublic: false, lastMessageAt: null });
  });

  it('allows only one DIRECT chat per pair (directKey), but many groups', async () => {
    await makeChat({ type: 'DIRECT', name: null, directKey: 'a:b' });
    await expectUniqueViolation(makeChat({ type: 'DIRECT', name: null, directKey: 'a:b' }));
    await makeChat();
    await makeChat(); // directKey NULL does not collide
  });

  it('keeps the chat when its creator is deleted', async () => {
    const creator = await makeUser();
    const chat = await makeChat({ createdById: creator.id });
    await prisma.user.delete({ where: { id: creator.id } });
    expect(
      (await prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).createdById,
    ).toBeNull();
  });
});

describe('chat members', () => {
  it('start with read cursor 0 and the MEMBER role', async () => {
    const [user, chat] = [await makeUser(), await makeChat()];
    const member = await prisma.chatMember.create({ data: { chatId: chat.id, userId: user.id } });
    expect(member).toMatchObject({ role: 'MEMBER', lastReadSeq: 0 });
  });

  it('cannot join the same chat twice', async () => {
    const [user, chat] = [await makeUser(), await makeChat()];
    await prisma.chatMember.create({ data: { chatId: chat.id, userId: user.id } });
    await expectUniqueViolation(
      prisma.chatMember.create({ data: { chatId: chat.id, userId: user.id } }),
    );
  });

  it('are removed with their chat and with their user', async () => {
    const [u1, u2, chat] = [await makeUser(), await makeUser(), await makeChat()];
    await prisma.chatMember.createMany({
      data: [
        { chatId: chat.id, userId: u1.id },
        { chatId: chat.id, userId: u2.id },
      ],
    });
    await prisma.user.delete({ where: { id: u1.id } });
    expect(await prisma.chatMember.count()).toBe(1);
    await prisma.chat.delete({ where: { id: chat.id } });
    expect(await prisma.chatMember.count()).toBe(0);
  });
});

describe('messages', () => {
  it('numbers messages per chat: (chat, seq) is unique, but seq can repeat across chats', async () => {
    const [c1, c2] = [await makeChat(), await makeChat()];
    await makeMessage(c1.id, 1);
    await makeMessage(c2.id, 1);
    await expectUniqueViolation(makeMessage(c1.id, 1));
  });

  it('is idempotent per sender: (sender, clientId) is unique, NULL client ids are not', async () => {
    const [sender, other, chat] = [await makeUser(), await makeUser(), await makeChat()];
    const clientId = randomUUID();
    await makeMessage(chat.id, 1, { senderId: sender.id, clientId });
    await expectUniqueViolation(makeMessage(chat.id, 2, { senderId: sender.id, clientId }));
    await makeMessage(chat.id, 3, { senderId: other.id, clientId }); // another sender may reuse it
    await makeMessage(chat.id, 4, { senderId: sender.id }); // no client id
    await makeMessage(chat.id, 5, { senderId: sender.id }); // no client id again
  });

  it('keeps the message (sender becomes NULL) when the sender is deleted', async () => {
    const [sender, chat] = [await makeUser(), await makeChat()];
    const message = await makeMessage(chat.id, 1, { senderId: sender.id, content: 'ciphertext' });
    await prisma.user.delete({ where: { id: sender.id } });
    expect(await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
      senderId: null,
      content: 'ciphertext',
    });
  });

  it('turns replyToId into NULL when the replied-to message is deleted', async () => {
    const chat = await makeChat();
    const original = await makeMessage(chat.id, 1);
    const reply = await makeMessage(chat.id, 2, { replyToId: original.id });
    await prisma.message.delete({ where: { id: original.id } });
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: reply.id } })).replyToId,
    ).toBeNull();
  });

  it('allows an attachment-only message (content NULL)', async () => {
    const chat = await makeChat();
    expect((await makeMessage(chat.id, 1)).content).toBeNull();
  });

  it('is deleted with its chat', async () => {
    const chat = await makeChat();
    await makeMessage(chat.id, 1);
    await prisma.chat.delete({ where: { id: chat.id } });
    expect(await prisma.message.count()).toBe(0);
  });

  it('accepts an application-generated id, which is bound into the ciphertext', async () => {
    const chat = await makeChat();
    const id = randomUUID();
    expect((await makeMessage(chat.id, 1, { id })).id).toBe(id);
  });
});

describe('attachments', () => {
  it('stores metadata only, and is not linked to a message until it is sent', async () => {
    const user = await makeUser();
    const attachment = await makeAttachment(user.id);
    expect(attachment.messageId).toBeNull();
    expect(Object.keys(attachment).toSorted()).toEqual(
      [
        'createdAt',
        'fileName',
        'id',
        'messageId',
        'mimeType',
        'size',
        'storageKey',
        'uploaderId',
      ].toSorted(),
    );
  });

  it('has a unique storage key', async () => {
    const user = await makeUser();
    await makeAttachment(user.id, { storageKey: 'k1' });
    await expectUniqueViolation(makeAttachment(user.id, { storageKey: 'k1' }));
  });

  it('is deleted with its message and with its uploader', async () => {
    const [user, chat] = [await makeUser(), await makeChat()];
    const message = await makeMessage(chat.id, 1);
    await makeAttachment(user.id, { messageId: message.id });
    await prisma.message.delete({ where: { id: message.id } });
    expect(await prisma.attachment.count()).toBe(0);

    await makeAttachment(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.attachment.count()).toBe(0);
  });
});
