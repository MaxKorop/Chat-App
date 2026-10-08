import type { DeleteMessageEventInput, EditMessageEventInput } from '@chat/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/lib/query-keys';
import {
  deleteMessageOverSocket,
  editMessageOverSocket,
  sendMessageOverSocket,
} from '@/lib/socket';
import { usePendingStore } from '@/stores/pending-store';

import { getMessages, uploadAttachments } from './api';
import { upsertMessage } from './cache';

/** The history of a chat, newest page first; `fetchNextPage` loads older messages. */
export const useMessages = (chatId: string) =>
  useInfiniteQuery({
    queryKey: chatKeys.messages(chatId),
    queryFn: ({ pageParam, signal }) => getMessages(chatId, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });

export type SendDraft = {
  content?: string | undefined;
  replyToId?: string | undefined;
  files: File[];
  /** set when retrying a message that failed earlier */
  clientId?: string | undefined;
  attachmentIds?: string[] | undefined;
};

/**
 * Sends a message. It appears at once as "sending"; the server's confirmation replaces it with the
 * stored message, and a failure keeps it, marked as failed, so the user can retry.
 */
export const useSendMessage = (chatId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SendDraft) => {
      const clientId = draft.clientId ?? crypto.randomUUID(); // a retry passes the same one
      const pending = usePendingStore.getState();
      pending.upsert({
        clientId,
        chatId,
        content: draft.content,
        replyToId: draft.replyToId,
        files: draft.files,
        attachmentIds: draft.attachmentIds,
        status: 'sending',
        createdAt: new Date().toISOString(),
      });
      try {
        let attachmentIds = draft.attachmentIds;
        if (!attachmentIds) {
          attachmentIds = draft.files.length
            ? (await uploadAttachments(draft.files)).map((a) => a.id)
            : [];
          pending.patch(clientId, { attachmentIds }); // remember them, so a retry does not upload again
        }
        const message = await sendMessageOverSocket({
          chatId,
          clientId,
          content: draft.content,
          replyToId: draft.replyToId,
          attachmentIds,
        });
        upsertMessage(qc, message); // the same upsert as the live broadcast, so the order does not matter
        pending.remove(clientId);
      } catch (error) {
        pending.patch(clientId, { status: 'failed', error: (error as Error).message });
        throw error; // the query client shows the toast
      }
    },
  });
};

// Edit and delete need no cache update here: the server's broadcast updates every client, this one included.
export const useEditMessage = () =>
  useMutation({ mutationFn: (input: EditMessageEventInput) => editMessageOverSocket(input) });
export const useDeleteMessage = () =>
  useMutation({ mutationFn: (input: DeleteMessageEventInput) => deleteMessageOverSocket(input) });
