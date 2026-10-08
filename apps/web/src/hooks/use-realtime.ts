import type { ChatDetailsDto, MeDto } from '@chat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { removeMessage, replaceMessage, upsertMessage } from '@/features/messages/cache';
import { chatKeys, userKeys } from '@/lib/query-keys';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { useTypingStore } from '@/stores/typing-store';

/**
 * Connects the socket while the user is logged in, and turns what the server pushes into updates of
 * the React Query cache. Call it once, near the root. Follows docs/realtime.md.
 */
export function useRealtime() {
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) return;
    const ui = useChatUiStore.getState();
    const myId = () => qc.getQueryData<MeDto>(userKeys.me)?.id;
    const refreshChatList = () =>
      void qc.invalidateQueries({ queryKey: chatKeys.list, exact: true });
    let connectedBefore = false;

    socket.on('connect', () => {
      ui.setConnection('online');
      // Events that happened while we were offline (or while the server redeployed) are not replayed.
      if (connectedBefore) {
        void qc.invalidateQueries({ queryKey: chatKeys.list });
        void qc.invalidateQueries({ queryKey: userKeys.all });
      }
      connectedBefore = true;
    });
    socket.on('disconnect', (reason) => {
      ui.setConnection('offline');
      if (reason === 'io server disconnect') socket.connect(); // the server closed it; Socket.IO will not retry that itself
    });
    socket.on('connect_error', (error) => {
      ui.setConnection('offline');
      if (error.message === 'Unauthorized') useAuthStore.getState().logout();
    });

    socket.on('message:created', (message) => {
      upsertMessage(qc, message);
      refreshChatList(); // last-message preview and unread badge
    });
    socket.on('message:updated', (message) => replaceMessage(qc, message));
    socket.on('message:deleted', ({ chatId, messageId }) => {
      removeMessage(qc, chatId, messageId);
      refreshChatList();
    });
    socket.on('chat:read', ({ chatId, userId, seq }) => {
      qc.setQueryData<ChatDetailsDto>(
        chatKeys.detail(chatId),
        (chat) =>
          chat && {
            ...chat,
            members: chat.members.map((m) =>
              m.userId === userId ? { ...m, lastReadSeq: Math.max(m.lastReadSeq, seq) } : m,
            ),
          },
      );
      if (userId === myId()) refreshChatList(); // we read it, perhaps in another tab: the unread badge changes
    });
    socket.on('typing', ({ chatId, userId, username, isTyping }) =>
      useTypingStore.getState().set(chatId, userId, username, isTyping),
    );
    socket.on('chat:changed', () => void qc.invalidateQueries({ queryKey: chatKeys.list }));
    socket.on(
      'presence:changed',
      ({ userId }) => void qc.invalidateQueries({ queryKey: userKeys.detail(userId) }),
    );

    ui.setConnection('connecting');
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, qc]);
}
