import { create } from 'zustand';

/**
 * Messages the user has sent that the server has not confirmed yet. They live here, outside the
 * React Query cache, so that the cache only ever holds messages the server really has.
 */
export type PendingMessage = {
  clientId: string;
  chatId: string;
  content?: string | undefined;
  replyToId?: string | undefined;
  files: File[];
  /** filled in after the upload, so a retry does not upload the same files again */
  attachmentIds?: string[] | undefined;
  status: 'sending' | 'failed';
  error?: string | undefined;
  createdAt: string;
};

type PendingState = {
  byChat: Record<string, PendingMessage[]>;
  upsert: (message: PendingMessage) => void;
  patch: (clientId: string, changes: Partial<PendingMessage>) => void;
  remove: (clientId: string) => void;
  reset: () => void;
};

export const usePendingStore = create<PendingState>()((set) => ({
  byChat: {},

  upsert: (message) =>
    set(({ byChat }) => {
      const list = byChat[message.chatId] ?? [];
      const index = list.findIndex((m) => m.clientId === message.clientId);
      const next =
        index === -1 ? [...list, message] : list.map((m, i) => (i === index ? message : m));
      return { byChat: { ...byChat, [message.chatId]: next } };
    }),

  patch: (clientId, changes) =>
    set(({ byChat }) => ({
      byChat: Object.fromEntries(
        Object.entries(byChat).map(([chatId, list]) => [
          chatId,
          list.map((m) => (m.clientId === clientId ? { ...m, ...changes } : m)),
        ]),
      ),
    })),

  remove: (clientId) =>
    set(({ byChat }) => ({
      byChat: Object.fromEntries(
        Object.entries(byChat)
          .map(([chatId, list]) => [chatId, list.filter((m) => m.clientId !== clientId)] as const)
          .filter(([, list]) => list.length > 0),
      ),
    })),

  reset: () => set({ byChat: {} }),
}));
