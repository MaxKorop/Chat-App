import type { ChatDetailsDto } from '@chat/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/lib/query-keys';

import { createChat, getChat, getChats, joinChat, searchChats } from './api';

export const useChats = () => useQuery({ queryKey: chatKeys.list, queryFn: getChats });

/** One chat with its members and their read cursors. Pass null when no chat is selected. */
export const useChat = (chatId: string | null) =>
  useQuery({
    queryKey: chatKeys.detail(chatId ?? ''),
    queryFn: () => getChat(chatId!),
    enabled: !!chatId,
  });

export const useChatSearch = (query: string) => {
  const q = query.trim();
  return useQuery({
    queryKey: chatKeys.search(q),
    queryFn: ({ signal }) => searchChats(q, signal),
    enabled: q.length > 0,
  });
};

// Both mutations return a chat the caller will show next, so its details are cached right away.
function useChatMutation<Input>(request: (input: Input) => Promise<ChatDetailsDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async (chat) => {
      qc.setQueryData(chatKeys.detail(chat.id), chat);
      await qc.invalidateQueries({ queryKey: chatKeys.list, exact: true });
    },
  });
}

export const useCreateChat = () => useChatMutation(createChat);

export const useJoinChat = () => {
  const qc = useQueryClient();
  const join = useChatMutation(joinChat);
  // the joined chat is no longer "not yet joined" in search results
  const refreshSearches = () => qc.invalidateQueries({ queryKey: chatKeys.searches });
  return {
    ...join,
    mutate: (chatId: string) => join.mutate(chatId, { onSuccess: refreshSearches }),
    mutateAsync: async (chatId: string) => {
      const chat = await join.mutateAsync(chatId);
      await refreshSearches();
      return chat;
    },
  };
};
