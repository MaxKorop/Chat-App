import { describe, expect, it } from 'vitest';

import { LIMITS } from '../constants';
import {
  deleteMessageEventSchema,
  editMessageEventSchema,
  messageSchema,
  messagesPageSchema,
  messagesQuerySchema,
  sendMessageEventSchema,
  sendMessageSchema,
} from './message';

const id = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const other = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';

describe('sendMessageSchema (composer form)', () => {
  it('accepts text and defaults attachmentIds to []', () => {
    expect(sendMessageSchema.parse({ content: 'hello' })).toEqual({
      content: 'hello',
      attachmentIds: [],
    });
  });

  it('accepts an attachments-only message', () => {
    expect(sendMessageSchema.safeParse({ attachmentIds: [id] }).success).toBe(true);
  });

  it('rejects an empty or whitespace-only message with a readable error', () => {
    for (const input of [{}, { content: '' }, { content: '   ' }]) {
      const result = sendMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Message cannot be empty');
    }
  });

  it('rejects text over the limit and too many attachments', () => {
    expect(
      sendMessageSchema.safeParse({ content: 'x'.repeat(LIMITS.MESSAGE_MAX + 1) }).success,
    ).toBe(false);
    const tooMany = Array.from({ length: LIMITS.ATTACHMENTS_PER_MESSAGE + 1 }, () => id);
    expect(sendMessageSchema.safeParse({ attachmentIds: tooMany }).success).toBe(false);
  });
});

describe('sendMessageEventSchema (WebSocket)', () => {
  const event = { chatId: id, clientId: other, content: 'hi' };

  it('needs a chat id and a client id (the idempotency key)', () => {
    expect(sendMessageEventSchema.safeParse(event).success).toBe(true);
    expect(sendMessageEventSchema.safeParse({ ...event, clientId: undefined }).success).toBe(false);
    expect(sendMessageEventSchema.safeParse({ ...event, clientId: 'abc' }).success).toBe(false);
    expect(sendMessageEventSchema.safeParse({ ...event, chatId: 'abc' }).success).toBe(false);
  });

  it('applies the same "not empty" rule', () => {
    expect(sendMessageEventSchema.safeParse({ chatId: id, clientId: other }).success).toBe(false);
  });

  it('defaults attachmentIds in the parsed output', () => {
    expect(sendMessageEventSchema.parse(event).attachmentIds).toEqual([]);
  });
});

describe('edit and delete payloads', () => {
  it('editMessageEventSchema rejects empty content', () => {
    expect(editMessageEventSchema.safeParse({ messageId: id, content: '  ' }).success).toBe(false);
    expect(editMessageEventSchema.safeParse({ messageId: id, content: 'fixed' }).success).toBe(
      true,
    );
  });

  it('deleteMessageEventSchema needs a uuid', () => {
    expect(deleteMessageEventSchema.safeParse({ messageId: id }).success).toBe(true);
    expect(deleteMessageEventSchema.safeParse({ messageId: '1' }).success).toBe(false);
  });
});

describe('messagesQuerySchema (history)', () => {
  it('coerces query-string values and applies the default page size', () => {
    expect(messagesQuerySchema.parse({})).toEqual({ limit: LIMITS.MESSAGES_PAGE_SIZE });
    expect(messagesQuerySchema.parse({ before: '42', limit: '10' })).toEqual({
      before: 42,
      limit: 10,
    });
  });

  it('rejects out-of-range values', () => {
    expect(messagesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ before: '0' }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ before: 'abc' }).success).toBe(false);
  });
});

describe('messageSchema and messagesPageSchema', () => {
  const message = {
    id,
    chatId: other,
    seq: 12,
    clientId: null,
    sender: { id: other, username: 'alice' },
    content: 'hello',
    replyTo: null,
    attachments: [],
    createdAt: '2026-01-05T10:00:00.000Z',
    editedAt: null,
  };

  it('accepts a normal message, and one whose sender was deleted', () => {
    expect(messageSchema.safeParse(message).success).toBe(true);
    expect(messageSchema.safeParse({ ...message, sender: null, content: null }).success).toBe(true);
  });

  it('requires an integer seq and ISO timestamps', () => {
    expect(messageSchema.safeParse({ ...message, seq: 1.5 }).success).toBe(false);
    expect(messageSchema.safeParse({ ...message, createdAt: 'yesterday' }).success).toBe(false);
  });

  it('page: newest-first items and a numeric (or null) nextBefore', () => {
    expect(messagesPageSchema.safeParse({ items: [message], nextBefore: 12 }).success).toBe(true);
    expect(messagesPageSchema.safeParse({ items: [], nextBefore: null }).success).toBe(true);
    expect(messagesPageSchema.safeParse({ items: [], nextBefore: 'x' }).success).toBe(false);
  });
});
