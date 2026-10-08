import { describe, expect, it } from 'vitest';

import {
  chatDetailsSchema,
  createChatSchema,
  markReadEventSchema,
  typingEventSchema,
} from './chat';

const id = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const other = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';

describe('createChatSchema', () => {
  it('accepts a DIRECT chat with a user id', () => {
    expect(createChatSchema.safeParse({ type: 'DIRECT', userId: id }).success).toBe(true);
  });

  it('rejects a DIRECT chat without a valid user id', () => {
    expect(createChatSchema.safeParse({ type: 'DIRECT' }).success).toBe(false);
    expect(createChatSchema.safeParse({ type: 'DIRECT', userId: 'alice' }).success).toBe(false);
  });

  it('accepts a GROUP chat and trims its name', () => {
    const parsed = createChatSchema.parse({
      type: 'GROUP',
      name: '  Study group  ',
      isPublic: true,
      memberIds: [id, other],
    });
    expect(parsed).toMatchObject({ type: 'GROUP', name: 'Study group' });
  });

  it.each([
    ['a too short name', { name: 'ab' }],
    ['a too long name', { name: 'x'.repeat(51) }],
    ['a member id that is not a uuid', { memberIds: ['bob'] }],
    ['more than 100 members', { memberIds: Array.from({ length: 101 }, () => id) }],
    ['a missing isPublic flag', { isPublic: undefined }],
  ])('rejects a GROUP chat with %s', (_name, patch) => {
    const group = {
      type: 'GROUP',
      name: 'Study group',
      isPublic: false,
      memberIds: [id],
      ...patch,
    };
    expect(createChatSchema.safeParse(group).success).toBe(false);
  });

  it('rejects an unknown chat type', () => {
    expect(createChatSchema.safeParse({ type: 'CHANNEL', name: 'news' }).success).toBe(false);
  });
});

describe('socket payloads', () => {
  it('markReadEventSchema accepts a non-negative integer seq only', () => {
    expect(markReadEventSchema.safeParse({ chatId: id, seq: 0 }).success).toBe(true);
    expect(markReadEventSchema.safeParse({ chatId: id, seq: -1 }).success).toBe(false);
    expect(markReadEventSchema.safeParse({ chatId: id, seq: 1.5 }).success).toBe(false);
    expect(markReadEventSchema.safeParse({ chatId: 'x', seq: 1 }).success).toBe(false);
  });

  it('typingEventSchema needs a chat id and a boolean', () => {
    expect(typingEventSchema.safeParse({ chatId: id, isTyping: true }).success).toBe(true);
    expect(typingEventSchema.safeParse({ chatId: id, isTyping: 'yes' }).success).toBe(false);
  });
});

describe('chatDetailsSchema', () => {
  it('carries the read cursor of every member', () => {
    const details = {
      id,
      type: 'GROUP',
      title: 'Study group',
      isPublic: false,
      isMember: true,
      unreadCount: 3,
      lastMessage: { preview: 'hello', createdAt: '2026-01-05T10:00:00.000Z' },
      description: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      members: [{ userId: id, username: 'alice', role: 'OWNER', lastReadSeq: 7 }],
    };
    expect(chatDetailsSchema.parse(details).members[0]?.lastReadSeq).toBe(7);
    expect(
      chatDetailsSchema.safeParse({
        ...details,
        members: [{ ...details.members[0], lastReadSeq: 'x' }],
      }).success,
    ).toBe(false);
  });
});
