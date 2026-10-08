import { randomUUID } from 'node:crypto';

import { messageSchema, messagesPageSchema, type SendMessageEventOutput } from '@chat/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { DomainEvents } from '../../common/domain-events';
import {
  addMessage,
  createDirectChat,
  createGroup,
  createTestApp,
  createUser,
  type TestApp,
} from '../../test/app';
import { EncryptionService, UNREADABLE_MESSAGE } from '../crypto/encryption.service';
import { MessagesService } from './messages.service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const MISSING = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

let t: TestApp;
let emit: MockInstance<EventEmitter2['emit']>;
let messages: MessagesService;
beforeEach(async () => {
  t = await createTestApp();
  emit = vi.spyOn(t.app.get(EventEmitter2), 'emit');
  messages = t.app.get(MessagesService);
});
afterEach(() => t.app.close());

const eventsOf = (name: string) =>
  emit.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);
const input = (
  chatId: string,
  patch: Partial<SendMessageEventOutput> = {},
): SendMessageEventOutput => ({
  chatId,
  clientId: randomUUID(),
  content: 'hello',
  attachmentIds: [],
  ...patch,
});
async function twoPeopleInAGroup() {
  const [me, bob] = [
    await createUser(t.prisma, { username: 'me' }),
    await createUser(t.prisma, { username: 'bob' }),
  ];
  const chat = await createGroup(t.prisma, me, [bob]);
  return { me, bob, chat };
}
const uploadPngs = async (user: Parameters<TestApp['auth']>[0], count = 1) => {
  const req = t.http().post('/api/attachments').set(t.auth(user));
  for (let i = 0; i < count; i += 1)
    req.attach('files', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
  return (await req.expect(201)).body as { id: string; url: string }[];
};

describe('MessagesService.send', () => {
  it('stores the message encrypted and returns it as a DTO', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    const dto = messageSchema.parse(
      await messages.send(me.id, input(chat.id, { content: 'top secret' })),
    );

    expect(dto).toMatchObject({
      chatId: chat.id,
      seq: 1,
      content: 'top secret',
      sender: { id: me.id, username: 'me' },
      replyTo: null,
      attachments: [],
      editedAt: null,
    });
    const row = await t.prisma.message.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.content).toMatch(/^1\./);
    expect(row.content).not.toContain('top secret');
    // and only this chat and this message id can open it
    expect(t.app.get(EncryptionService).decrypt(row.content!, chat.id, dto.id)).toBe('top secret');
  });

  it('numbers messages 1, 2, 3 per chat and keeps the chat’s counters up to date', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    const other = await createGroup(t.prisma, me);
    const seqs = [
      (await messages.send(me.id, input(chat.id))).seq,
      (await messages.send(me.id, input(chat.id))).seq,
      (await messages.send(me.id, input(other.id))).seq, // another chat counts on its own
      (await messages.send(me.id, input(chat.id))).seq,
    ];
    expect(seqs).toEqual([1, 2, 1, 3]);
    const updated = await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } });
    expect(updated.lastSeq).toBe(3);
    expect(updated.lastMessageAt).toBeInstanceOf(Date);
  });

  it('gives concurrent senders distinct numbers without gaps', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        messages.send(i % 2 ? me.id : bob.id, input(chat.id, { content: `m${i}` })),
      ),
    );
    expect(results.map((r) => r.seq).toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect((await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).lastSeq).toBe(20);
  });

  it('announces the new message', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    const dto = await messages.send(me.id, input(chat.id));
    expect(eventsOf(DomainEvents.MessageCreated)).toEqual([dto]);
  });

  describe('is idempotent: a retried send (the acknowledgement got lost) never duplicates', () => {
    it('returns the stored message for a repeated clientId', async () => {
      const { me, chat } = await twoPeopleInAGroup();
      const first = input(chat.id);
      const a = await messages.send(me.id, first);
      emit.mockClear();
      const b = await messages.send(me.id, first);

      expect(b).toEqual(a);
      expect(await t.prisma.message.count()).toBe(1);
      expect((await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).lastSeq).toBe(1);
      expect(eventsOf(DomainEvents.MessageCreated)).toEqual([]); // already announced the first time
    });

    it('survives two identical sends arriving at the same moment', async () => {
      const { me, chat } = await twoPeopleInAGroup();
      const same = input(chat.id);
      const [a, b] = await Promise.all([messages.send(me.id, same), messages.send(me.id, same)]);
      expect(a.id).toBe(b.id);
      expect(await t.prisma.message.count()).toBe(1);
      expect((await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).lastSeq).toBe(1);
    });

    it('treats the same clientId from another sender as a different message', async () => {
      const { me, bob, chat } = await twoPeopleInAGroup();
      const same = input(chat.id);
      await messages.send(me.id, same);
      await messages.send(bob.id, same);
      expect(await t.prisma.message.count()).toBe(2);
    });

    it('refuses to reuse a clientId for a different chat (409)', async () => {
      const { me, chat } = await twoPeopleInAGroup();
      const elsewhere = await createGroup(t.prisma, me);
      const first = input(chat.id);
      await messages.send(me.id, first);
      await expect(messages.send(me.id, { ...first, chatId: elsewhere.id })).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  it('refuses people who are not in the chat (403) and stores nothing', async () => {
    const { chat } = await twoPeopleInAGroup();
    const outsider = await createUser(t.prisma);
    await expect(messages.send(outsider.id, input(chat.id))).rejects.toMatchObject({ status: 403 });
    expect(await t.prisma.message.count()).toBe(0);
    expect(eventsOf(DomainEvents.MessageCreated)).toEqual([]);
  });

  describe('replies', () => {
    it('quotes the original message in the DTO', async () => {
      const { me, bob, chat } = await twoPeopleInAGroup();
      const original = await messages.send(
        bob.id,
        input(chat.id, { content: 'Are you coming tonight?' }),
      );
      const reply = await messages.send(
        me.id,
        input(chat.id, { content: 'Yes!', replyToId: original.id }),
      );
      expect(messageSchema.parse(reply).replyTo).toEqual({
        id: original.id,
        senderUsername: 'bob',
        preview: 'Are you coming tonight?',
      });
    });

    it('only works inside the same chat (400)', async () => {
      const { me, chat } = await twoPeopleInAGroup();
      const elsewhere = await createGroup(t.prisma, me);
      const foreign = await messages.send(me.id, input(elsewhere.id));
      await expect(
        messages.send(me.id, input(chat.id, { replyToId: foreign.id })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        messages.send(me.id, input(chat.id, { replyToId: MISSING })),
      ).rejects.toMatchObject({ status: 400 });
      expect(await t.prisma.message.count()).toBe(1);
    });
  });

  describe('attachments', () => {
    it('links the uploaded files to the message, in upload order, with working URLs', async () => {
      const { me, chat } = await twoPeopleInAGroup();
      const files = await uploadPngs(me, 3);
      const dto = await messages.send(
        me.id,
        input(chat.id, { content: undefined, attachmentIds: files.map((f) => f.id) }),
      );

      expect(dto.content).toBeNull(); // an attachment-only message
      expect(dto.attachments.map((a) => a.id)).toEqual(files.map((f) => f.id));
      expect((await fetch(dto.attachments[0]!.url)).status).toBe(200);
      expect(
        (await t.prisma.message.findUniqueOrThrow({ where: { id: dto.id } })).content,
      ).toBeNull();
    });

    it('refuses files that are not yours, are already used, or do not exist (400), and rolls everything back', async () => {
      const { me, bob, chat } = await twoPeopleInAGroup();
      const [mine] = await uploadPngs(me);
      const [bobs] = await uploadPngs(bob);
      await messages.send(me.id, input(chat.id, { attachmentIds: [mine!.id] })); // now used

      for (const attachmentIds of [[bobs!.id], [mine!.id], [MISSING]]) {
        await expect(messages.send(me.id, input(chat.id, { attachmentIds }))).rejects.toMatchObject(
          { status: 400 },
        );
      }
      expect(await t.prisma.message.count()).toBe(1);
      expect((await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).lastSeq).toBe(1); // no number was wasted
      expect(await t.prisma.attachment.count({ where: { id: bobs!.id, messageId: null } })).toBe(1); // still free
    });
  });
});

describe('MessagesService.edit', () => {
  it('lets the author change the text; it is re-encrypted, marked as edited, and announced', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    const original = await messages.send(me.id, input(chat.id, { content: 'typo' }));
    const before = await t.prisma.message.findUniqueOrThrow({ where: { id: original.id } });

    const edited = messageSchema.parse(
      await messages.edit(me.id, { messageId: original.id, content: 'fixed' }),
    );
    expect(edited).toMatchObject({
      id: original.id,
      seq: original.seq,
      content: 'fixed',
      createdAt: original.createdAt,
    });
    expect(edited.editedAt).not.toBeNull();

    const after = await t.prisma.message.findUniqueOrThrow({ where: { id: original.id } });
    expect(after.content).not.toBe(before.content);
    expect(after.content).not.toContain('fixed');
    expect(eventsOf(DomainEvents.MessageUpdated)).toEqual([edited]);
  });

  it('is only for the author: other members (even the owner) get 403', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup(); // me = owner
    const bobs = await messages.send(bob.id, input(chat.id, { content: 'mine' }));
    await expect(
      messages.edit(me.id, { messageId: bobs.id, content: 'hijacked' }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await messages.list(me.id, chat.id, { limit: 10 })).items[0]!.content).toBe('mine');
  });

  it('refuses outsiders (403) and unknown messages (404), and nobody can edit a deleted account’s message', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup();
    const outsider = await createUser(t.prisma);
    const message = await messages.send(bob.id, input(chat.id));
    await expect(
      messages.edit(outsider.id, { messageId: message.id, content: 'x' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(messages.edit(me.id, { messageId: MISSING, content: 'x' })).rejects.toMatchObject({
      status: 404,
    });

    await t.prisma.user.delete({ where: { id: bob.id } });
    await expect(
      messages.edit(me.id, { messageId: message.id, content: 'x' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('MessagesService.delete', () => {
  it('lets authors delete their own messages, announces it, and removes the attachment files too', async () => {
    const { bob, chat } = await twoPeopleInAGroup();
    const [file] = await uploadPngs(bob);
    const message = await messages.send(bob.id, input(chat.id, { attachmentIds: [file!.id] }));
    expect((await fetch(file!.url)).status).toBe(200);

    await messages.delete(bob.id, { messageId: message.id });
    expect(await t.prisma.message.count()).toBe(0);
    expect(await t.prisma.attachment.count()).toBe(0);
    expect((await fetch(file!.url)).status).toBe(404); // the file itself is gone from S3
    expect(eventsOf(DomainEvents.MessageDeleted)).toEqual([
      { chatId: chat.id, messageId: message.id },
    ]);
  });

  describe('moderation follows the chat type', () => {
    it('group: the owner may delete anyone’s message, a plain member only their own', async () => {
      const { me, bob, chat } = await twoPeopleInAGroup(); // me = owner
      const bobs = await messages.send(bob.id, input(chat.id));
      const mine = await messages.send(me.id, input(chat.id));
      await expect(messages.delete(bob.id, { messageId: mine.id })).rejects.toMatchObject({
        status: 403,
      });
      await expect(messages.delete(me.id, { messageId: bobs.id })).resolves.toBeUndefined();
      expect(await t.prisma.message.count()).toBe(1);
    });

    it('direct chat: both people may delete any message', async () => {
      const [a, b] = [await createUser(t.prisma), await createUser(t.prisma)];
      const dm = await createDirectChat(t.prisma, a, b);
      const fromA = await messages.send(a.id, input(dm.id));
      await expect(messages.delete(b.id, { messageId: fromA.id })).resolves.toBeUndefined();
    });
  });

  it('refuses outsiders (403) and unknown messages (404)', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    const outsider = await createUser(t.prisma);
    const message = await messages.send(me.id, input(chat.id));
    await expect(messages.delete(outsider.id, { messageId: message.id })).rejects.toMatchObject({
      status: 403,
    });
    await expect(messages.delete(me.id, { messageId: MISSING })).rejects.toMatchObject({
      status: 404,
    });
    expect(await t.prisma.message.count()).toBe(1);
  });

  it('keeps replies, which then no longer quote anything', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup();
    const original = await messages.send(bob.id, input(chat.id, { content: 'original' }));
    const reply = await messages.send(
      me.id,
      input(chat.id, { content: 'reply', replyToId: original.id }),
    );
    await messages.delete(bob.id, { messageId: original.id });
    const { items } = await messages.list(me.id, chat.id, { limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: reply.id, replyTo: null });
  });

  it('leaves a gap in the numbering (which clients handle by refetching), and later messages carry on after it', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    await messages.send(me.id, input(chat.id));
    const second = await messages.send(me.id, input(chat.id));
    await messages.delete(me.id, { messageId: second.id });
    expect((await messages.send(me.id, input(chat.id))).seq).toBe(3);
  });
});

const history = (
  user: Parameters<TestApp['auth']>[0],
  chatId: string,
  query: Record<string, string | number> = {},
) => t.http().get(`/api/chats/${chatId}/messages`).query(query).set(t.auth(user));

async function chatWithMessages(count: number) {
  const { me, bob, chat } = await twoPeopleInAGroup();
  for (let i = 1; i <= count; i += 1)
    await addMessage(t, chat.id, i % 2 ? me.id : bob.id, `message ${i}`);
  return { me, bob, chat };
}

describe('GET /api/chats/:chatId/messages', () => {
  it('returns the newest messages first, decrypted', async () => {
    const { me, chat } = await chatWithMessages(3);
    const page = messagesPageSchema.parse((await history(me, chat.id).expect(200)).body);
    expect(page.items.map((m) => [m.seq, m.content])).toEqual([
      [3, 'message 3'],
      [2, 'message 2'],
      [1, 'message 1'],
    ]);
    expect(page.nextBefore).toBeNull();
  });

  it('pages backwards with `before`, and says when there is nothing older', async () => {
    const { me, chat } = await chatWithMessages(7);
    const seqs = async (query: Record<string, string | number>) => {
      const body = (await history(me, chat.id, query).expect(200)).body;
      return [body.items.map((m: { seq: number }) => m.seq), body.nextBefore];
    };
    expect(await seqs({ limit: 3 })).toEqual([[7, 6, 5], 5]);
    expect(await seqs({ limit: 3, before: 5 })).toEqual([[4, 3, 2], 2]);
    expect(await seqs({ limit: 3, before: 2 })).toEqual([[1], null]);
  });

  it('does not offer a next page when the last page is exactly full', async () => {
    const { me, chat } = await chatWithMessages(3);
    expect((await history(me, chat.id, { limit: 3 }).expect(200)).body.nextBefore).toBeNull();
  });

  it('uses a page size of 50 by default', async () => {
    const { me, chat } = await chatWithMessages(55);
    const body = (await history(me, chat.id).expect(200)).body;
    expect(body.items).toHaveLength(50);
    expect(body.nextBefore).toBe(6);
  });

  it('contains only this chat’s messages, with replies and attachments resolved', async () => {
    const { me, chat } = await chatWithMessages(1);
    const elsewhere = await createGroup(t.prisma, me);
    await addMessage(t, elsewhere.id, me.id, 'other chat');
    const [file] = await uploadPngs(me);
    const original = (await messages.list(me.id, chat.id, { limit: 1 })).items[0]!;
    await messages.send(
      me.id,
      input(chat.id, { content: 'with photo', replyToId: original.id, attachmentIds: [file!.id] }),
    );

    const body = (await history(me, chat.id).expect(200)).body;
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      content: 'with photo',
      replyTo: { id: original.id, preview: 'message 1' },
    });
    expect((await fetch(body.items[0].attachments[0].url)).status).toBe(200);
  });

  it('shows a placeholder for a message that cannot be decrypted instead of failing the whole page', async () => {
    const { me, chat } = await chatWithMessages(2);
    const broken = await t.prisma.message.findFirstOrThrow({ where: { chatId: chat.id, seq: 2 } });
    await t.prisma.message.update({
      where: { id: broken.id },
      data: { content: '1.AAAA.AAAA.AAAA' },
    });

    const body = (await history(me, chat.id).expect(200)).body;
    expect(body.items.map((m: { content: string }) => m.content)).toEqual([
      UNREADABLE_MESSAGE,
      'message 1',
    ]);
  });

  it('shows messages of deleted accounts without a sender', async () => {
    const { me, bob, chat } = await chatWithMessages(2);
    await t.prisma.user.delete({ where: { id: bob.id } });
    const body = (await history(me, chat.id).expect(200)).body;
    expect(body.items.find((m: { seq: number }) => m.seq === 2).sender).toBeNull();
  });

  it('is for members only: outsiders get 403, even for a public group', async () => {
    const { chat } = await chatWithMessages(1);
    await t.prisma.chat.update({ where: { id: chat.id }, data: { isPublic: true } });
    const outsider = await createUser(t.prisma);
    await history(outsider, chat.id).expect(403);
  });

  it('validates the query (400) and requires authentication (401)', async () => {
    const { me, chat } = await chatWithMessages(1);
    await history(me, chat.id, { limit: 0 }).expect(400);
    await history(me, chat.id, { limit: 101 }).expect(400);
    await history(me, chat.id, { before: 'abc' }).expect(400);
    await history(me, 'not-a-uuid').expect(400);
    await t.http().get(`/api/chats/${chat.id}/messages`).expect(401);
  });
});

describe('previews of replies', () => {
  it('quote a photo-only message as "📷 Photo"', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup();
    const [file] = await uploadPngs(bob);
    const photo = await messages.send(
      bob.id,
      input(chat.id, { content: undefined, attachmentIds: [file!.id] }),
    );
    const reply = await messages.send(
      me.id,
      input(chat.id, { content: 'nice!', replyToId: photo.id }),
    );
    expect(reply.replyTo).toEqual({ id: photo.id, senderUsername: 'bob', preview: '📷 Photo' });
  });

  it('have no sender name when the author of the quoted message deleted their account', async () => {
    const { me, bob, chat } = await twoPeopleInAGroup();
    const original = await messages.send(bob.id, input(chat.id, { content: 'before I left' }));
    const reply = await messages.send(
      me.id,
      input(chat.id, { content: 'ok', replyToId: original.id }),
    );
    await t.prisma.user.delete({ where: { id: bob.id } });
    const { items } = await messages.list(me.id, chat.id, { limit: 10 });
    expect(items.find((m) => m.id === reply.id)?.replyTo).toEqual({
      id: original.id,
      senderUsername: null,
      preview: 'before I left',
    });
  });
});

describe('when something goes wrong', () => {
  it('a database failure while sending is reported as it is, announces nothing and wastes no number', async () => {
    const { me, chat } = await twoPeopleInAGroup();
    vi.spyOn(t.prisma, '$transaction').mockRejectedValue(new Error('connection lost'));
    await expect(messages.send(me.id, input(chat.id))).rejects.toThrow('connection lost');
    expect(eventsOf(DomainEvents.MessageCreated)).toEqual([]);
    expect((await t.prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).lastSeq).toBe(0);
  });

  it('deleting still succeeds when removing the files from S3 fails (the message is gone, only space is wasted)', async () => {
    const { bob, chat } = await twoPeopleInAGroup();
    const [file] = await uploadPngs(bob);
    const message = await messages.send(bob.id, input(chat.id, { attachmentIds: [file!.id] }));
    vi.spyOn(t.storage, 'deleteMany').mockRejectedValue(new Error('S3 unreachable'));

    await expect(messages.delete(bob.id, { messageId: message.id })).resolves.toBeUndefined();
    expect(await t.prisma.message.count()).toBe(0);
    expect(eventsOf(DomainEvents.MessageDeleted)).toEqual([
      { chatId: chat.id, messageId: message.id },
    ]);
  });
});
