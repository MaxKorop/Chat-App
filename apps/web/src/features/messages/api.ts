import type { AttachmentDto, MessagesPage } from '@chat/shared';

import { api } from '@/lib/api-client';

/** One page of history, newest first. `before` is the seq of the oldest message already loaded. */
export const getMessages = async (chatId: string, before?: number, signal?: AbortSignal) =>
  (
    await api.get<MessagesPage>(`/chats/${chatId}/messages`, {
      params: before ? { before } : {},
      signal,
    })
  ).data;

/** Files go up first (multipart); the message then refers to them by id. */
export const uploadAttachments = async (files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return (await api.post<AttachmentDto[]>('/attachments', form)).data;
};
