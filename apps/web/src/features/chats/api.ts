import type { ChatDetailsDto, ChatSummaryDto, CreateChatInput } from '@chat/shared';

import { api } from '@/lib/api-client';

export const getChats = async () => (await api.get<ChatSummaryDto[]>('/chats')).data;
export const searchChats = async (q: string, signal?: AbortSignal) =>
  (await api.get<ChatSummaryDto[]>('/chats/search', { params: { q }, signal })).data;
export const createChat = async (input: CreateChatInput) =>
  (await api.post<ChatDetailsDto>('/chats', input)).data;
export const getChat = async (id: string) => (await api.get<ChatDetailsDto>(`/chats/${id}`)).data;
export const joinChat = async (id: string) =>
  (await api.post<ChatDetailsDto>(`/chats/${id}/join`)).data;
