import { z } from 'zod';

import { LIMITS } from '../constants';
import { attachmentSchema } from './attachment';

// The "not empty" rule is a plain function and the event schema extends the *unrefined* object:
// extending a refined zod schema is a footgun.
const sendMessageBase = z.object({
  content: z.string().trim().max(LIMITS.MESSAGE_MAX).optional(),
  replyToId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).max(LIMITS.ATTACHMENTS_PER_MESSAGE).default([]),
});
const hasContentOrFiles = (m: { content?: string | undefined; attachmentIds: string[] }) =>
  !!m.content || m.attachmentIds.length > 0;
const EMPTY_MESSAGE = 'Message cannot be empty';

/** composer form */
export const sendMessageSchema = sendMessageBase.refine(hasContentOrFiles, EMPTY_MESSAGE);

// WebSocket payloads (`clientId` makes a retried send idempotent)
export const sendMessageEventSchema = sendMessageBase
  .extend({ chatId: z.uuid(), clientId: z.uuid() })
  .refine(hasContentOrFiles, EMPTY_MESSAGE);
export const editMessageEventSchema = z.object({
  messageId: z.uuid(),
  content: z.string().trim().min(1).max(LIMITS.MESSAGE_MAX),
});
export const deleteMessageEventSchema = z.object({ messageId: z.uuid() });

// REST: history
export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(), // seq of the oldest message you already have
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.MESSAGES_PAGE_SIZE),
});

export const messageSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  seq: z.number().int(), // per-chat, gap-free; drives ordering, pagination and read cursors
  clientId: z.uuid().nullable(),
  sender: z.object({ id: z.uuid(), username: z.string() }).nullable(),
  content: z.string().nullable(),
  replyTo: z
    .object({ id: z.uuid(), senderUsername: z.string().nullable(), preview: z.string() })
    .nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
});

export const messagesPageSchema = z.object({
  items: z.array(messageSchema), // newest first
  nextBefore: z.number().int().nullable(), // pass as `before` to load older; null = no more
});

export type MessageDto = z.infer<typeof messageSchema>;
export type MessagesPage = z.infer<typeof messagesPageSchema>;
export type SendMessageEventInput = z.input<typeof sendMessageEventSchema>;
export type SendMessageEventOutput = z.output<typeof sendMessageEventSchema>; // what the service receives after parsing
export type EditMessageEventInput = z.infer<typeof editMessageEventSchema>;
export type DeleteMessageEventInput = z.infer<typeof deleteMessageEventSchema>;
