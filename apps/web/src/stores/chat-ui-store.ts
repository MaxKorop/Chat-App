import type { MessageDto } from '@chat/shared';
import { create } from 'zustand';

export type Dialog = 'createChat' | 'settings' | 'chatInfo' | null;
export type ConnectionState = 'connecting' | 'online' | 'offline';

/** Client-only UI state. Anything that lives on the server is in React Query instead. */
type ChatUiState = {
  activeChatId: string | null;
  replyTo: MessageDto | null;
  editingMessageId: string | null;
  dialog: Dialog;
  profileUserId: string | null;
  connection: ConnectionState;
  /** true once the socket has connected at least once; "connecting" then means "reconnecting" */
  hasBeenOnline: boolean;
  openChat: (chatId: string | null) => void;
  setReplyTo: (message: MessageDto | null) => void;
  setEditing: (messageId: string | null) => void;
  setDialog: (dialog: Dialog) => void;
  showProfile: (userId: string | null) => void;
  setConnection: (connection: ConnectionState) => void;
  reset: () => void;
};

const initial = {
  activeChatId: null,
  replyTo: null,
  editingMessageId: null,
  dialog: null,
  profileUserId: null,
  connection: 'connecting',
  hasBeenOnline: false,
} as const;

export const useChatUiStore = create<ChatUiState>()((set) => ({
  ...initial,
  // a reply or an edit belongs to one chat, so switching chats drops it
  openChat: (activeChatId) => set({ activeChatId, replyTo: null, editingMessageId: null }),
  setReplyTo: (replyTo) => set({ replyTo }),
  setEditing: (editingMessageId) => set({ editingMessageId }),
  setDialog: (dialog) => set({ dialog }),
  showProfile: (profileUserId) => set({ profileUserId }),
  setConnection: (connection) =>
    set((state) => ({ connection, hasBeenOnline: state.hasBeenOnline || connection === 'online' })),
  reset: () => set({ ...initial }),
}));
