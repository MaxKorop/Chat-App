import { z } from 'zod';

import { LIMITS } from '../constants';

export const chatTypeSchema = z.enum(['DIRECT', 'GROUP']);
export const chatRoleSchema = z.enum(['OWNER', 'MEMBER']);

export const createChatSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DIRECT'), userId: z.uuid() }),
  z.object({
    type: z.literal('GROUP'),
    name: z.string().trim().min(LIMITS.CHAT_NAME_MIN).max(LIMITS.CHAT_NAME_MAX),
    description: z.string().trim().max(LIMITS.CHAT_DESCRIPTION_MAX).optional(),
    isPublic: z.boolean(),
    memberIds: z.array(z.uuid()).max(100),
  }),
]);

export const chatMemberSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  role: chatRoleSchema,
  lastReadSeq: z.number().int(), // "has read everything up to and including this seq"
});

export const chatSummarySchema = z.object({
  id: z.uuid(),
  type: chatTypeSchema,
  title: z.string(), // group name or the other user's username, resolved on the server
  isPublic: z.boolean(),
  isMember: z.boolean(),
  unreadCount: z.number().int(),
  lastMessage: z.object({ preview: z.string(), createdAt: z.iso.datetime() }).nullable(),
});

export const chatDetailsSchema = chatSummarySchema.extend({
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  members: z.array(chatMemberSchema),
});

// WebSocket payloads
export const markReadEventSchema = z.object({ chatId: z.uuid(), seq: z.number().int().min(0) });
export const typingEventSchema = z.object({ chatId: z.uuid(), isTyping: z.boolean() });

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type ChatMemberDto = z.infer<typeof chatMemberSchema>;
export type ChatSummaryDto = z.infer<typeof chatSummarySchema>;
export type ChatDetailsDto = z.infer<typeof chatDetailsSchema>;
export type MarkReadEventInput = z.infer<typeof markReadEventSchema>;
export type TypingEventInput = z.infer<typeof typingEventSchema>;
