import type { MessageDto, MessagesPage } from '@chat/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/lib/query-keys';

export type MessagePages = InfiniteData<MessagesPage, number | undefined>;

/** Every loaded message of a chat, newest first. */
export const flattenMessages = (data: { pages: MessagesPage[] } | undefined): MessageDto[] =>
  data?.pages.flatMap((page) => page.items) ?? [];

const mapPages = (
  data: MessagePages,
  change: (items: MessageDto[], pageIndex: number) => MessageDto[],
): MessagePages => ({
  ...data,
  pages: data.pages.map((page, index) => ({ ...page, items: change(page.items, index) })),
});

/**
 * Adds a message that arrived live, to the history of a chat that is open.
 * The sender receives their own message twice (the acknowledgement and the broadcast), so one that
 * is already there is replaced, never added again.
 */
export function upsertMessage(qc: QueryClient, message: MessageDto): void {
  const key = chatKeys.messages(message.chatId);
  const data = qc.getQueryData<MessagePages>(key);
  if (!data) return; // the chat was never opened: its history loads fresh when it is

  const all = flattenMessages(data);
  if (all.some((m) => m.id === message.id)) return replaceMessage(qc, message);

  const newest = all[0];
  if (newest && message.seq !== newest.seq + 1) {
    // A number is missing, so a message was missed (for example while offline): reload instead of guessing.
    void qc.invalidateQueries({ queryKey: key });
    return;
  }
  qc.setQueryData<MessagePages>(
    key,
    mapPages(data, (items, page) => (page === 0 ? [message, ...items] : items)),
  );
}

export function replaceMessage(qc: QueryClient, message: MessageDto): void {
  qc.setQueryData<MessagePages>(
    chatKeys.messages(message.chatId),
    (data) =>
      data && mapPages(data, (items) => items.map((m) => (m.id === message.id ? message : m))),
  );
}

export function removeMessage(qc: QueryClient, chatId: string, messageId: string): void {
  qc.setQueryData<MessagePages>(
    chatKeys.messages(chatId),
    (data) => data && mapPages(data, (items) => items.filter((m) => m.id !== messageId)),
  );
}
