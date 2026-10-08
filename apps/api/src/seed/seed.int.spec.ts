import { messagesPageSchema } from '@chat/shared';
import * as bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { env } from '../config/env';
import { decrypt, type Keyring } from '../modules/crypto/encryption';
import { createTestApp, createUser, type TestApp } from '../test/app';
import { DEMO_IDS, DEMO_PASSWORD, seedDatabase } from './seed';

const ring: Keyring = { keys: env.MESSAGE_KEYS, currentId: env.MESSAGE_KEY_ID };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
  await seedDatabase(t.prisma, ring);
});
afterEach(() => t.app.close());

const logIn = async (username: string) => {
  const res = await t
    .http()
    .post('/api/auth/log-in')
    .send({ username, password: DEMO_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
};
// Build the header first: a supertest request must not be created while another one is still running.
const chatsOf = async (username: string) => {
  const auth = await logIn(username);
  return (await t.http().get('/api/chats').set(auth).expect(200)).body;
};

const unread = async (username: string) =>
  Object.fromEntries(
    (await chatsOf(username)).map((c: { title: string; unreadCount: number }) => [
      c.title,
      c.unreadCount,
    ]),
  );

describe('seedDatabase', () => {
  it('creates three demo users who can log in through the real api', async () => {
    const users = await t.prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map((u) => u.username)).toEqual(['alice', 'bob', 'carol']);
    for (const user of users)
      expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash)).toBe(true);
    await logIn('alice');
  });

  it('makes alice friends with bob and carol, in both directions', async () => {
    const pairs = (await t.prisma.friendship.findMany())
      .map((f) => `${f.userId}>${f.friendId}`)
      .toSorted();
    const { alice, bob, carol } = DEMO_IDS;
    expect(pairs).toEqual(
      [`${alice}>${bob}`, `${alice}>${carol}`, `${bob}>${alice}`, `${carol}>${alice}`].toSorted(),
    );
  });

  it('creates a direct chat, a public group, a private group and a public group alice has not joined', async () => {
    const titles = (await chatsOf('alice')).map((c: { title: string }) => c.title).toSorted();
    expect(titles).toEqual(['Project X', 'Study group', 'bob']);
    const dm = await t.prisma.chat.findUniqueOrThrow({ where: { id: DEMO_IDS.dm } });
    expect(dm.directKey).toBe([DEMO_IDS.alice, DEMO_IDS.bob].toSorted().join(':'));
    expect(await t.prisma.chat.count({ where: { type: 'GROUP', isPublic: true } })).toBe(2);

    const auth = await logIn('alice');
    const search = await t
      .http()
      .get('/api/chats/search')
      .query({ q: 'open' })
      .set(auth)
      .expect(200);
    expect(search.body).toMatchObject([{ title: 'Open Source Club', isMember: false }]);
  });

  describe('messages', () => {
    it('are stored encrypted, never as plaintext', async () => {
      const rows = await t.prisma.message.findMany({ where: { content: { not: null } } });
      expect(rows.length).toBe(13);
      for (const row of rows) {
        expect(row.content).toMatch(/^1\./);
        expect(row.content).not.toMatch(/Welcome|library|slides/i);
        expect(decrypt(row.content!, ring, row.chatId, row.id)).toBeTruthy();
      }
    });

    it('are numbered 1..n in every chat, with the chat’s counters matching', async () => {
      for (const chat of await t.prisma.chat.findMany()) {
        const seqs = (
          await t.prisma.message.findMany({ where: { chatId: chat.id }, orderBy: { seq: 'asc' } })
        ).map((m) => m.seq);
        expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
        expect(chat.lastSeq).toBe(seqs.length);
        expect(chat.lastMessageAt).not.toBeNull();
      }
    });

    it('show a realistic history through the api: a reply, an edited message and old-to-new order', async () => {
      const auth = await logIn('bob');
      const page = messagesPageSchema.parse(
        (await t.http().get(`/api/chats/${DEMO_IDS.studyGroup}/messages`).set(auth).expect(200))
          .body,
      );
      expect(page.items.map((m) => m.seq)).toEqual([5, 4, 3, 2, 1]);
      expect(page.items.find((m) => m.seq === 4)?.replyTo).toMatchObject({
        senderUsername: 'carol',
      });
      expect(page.items.find((m) => m.seq === 5)?.editedAt).not.toBeNull();
      const times = page.items.map((m) => Date.parse(m.createdAt));
      expect(times).toEqual(times.toSorted((a, b) => b - a));
    });
  });

  it('leaves each demo user with something unread, so the badges can be seen', async () => {
    expect(await unread('alice')).toEqual({ bob: 1, 'Study group': 0, 'Project X': 1 });
    // carol read up to message 2; message 3 is her own and never counts, so 4 and 5 are unread
    expect(await unread('carol')).toMatchObject({ 'Study group': 2, 'Open Source Club': 0 });
  });

  it('can be run again: it replaces the demo data and leaves everything else alone', async () => {
    const stranger = await createUser(t.prisma, { username: 'stranger' });
    const counts = async () => [
      await t.prisma.user.count(),
      await t.prisma.chat.count(),
      await t.prisma.message.count(),
      await t.prisma.friendship.count(),
    ];
    const before = await counts();

    await seedDatabase(t.prisma, ring);
    expect(await counts()).toEqual([before[0], ...before.slice(1)]);
    expect(await t.prisma.user.findUnique({ where: { id: stranger.id } })).not.toBeNull();
  });

  it('refuses to run in production', async () => {
    await expect(seedDatabase(t.prisma, ring, { production: true })).rejects.toThrow(/production/i);
  });
});
