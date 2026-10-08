/**
 * Services announce what happened with these events and know nothing about sockets.
 * The realtime gateway listens and broadcasts.
 */
export const DomainEvents = {
  MessageCreated: 'message.created', // MessageDto
  MessageUpdated: 'message.updated', // MessageDto
  MessageDeleted: 'message.deleted', // { chatId, messageId }
  ChatRead: 'chat.read', // { chatId, userId, seq }
  ChatMembersChanged: 'chat.members-changed', // { chatId, userIds }: a chat was created or someone joined
} as const;

export type MessageDeletedEvent = { chatId: string; messageId: string };
export type ChatReadEvent = { chatId: string; userId: string; seq: number };
export type ChatMembersChangedEvent = { chatId: string; userIds: string[] };
