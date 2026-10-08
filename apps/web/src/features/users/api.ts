import type { MeDto, PublicUserDto, UpdateMeInput } from '@chat/shared';

import { api } from '@/lib/api-client';

export const searchUsers = async (q: string, signal?: AbortSignal) =>
  (await api.get<PublicUserDto[]>('/users/search', { params: { q }, signal })).data;
export const getUser = async (id: string) => (await api.get<PublicUserDto>(`/users/${id}`)).data;
export const updateMe = async (input: UpdateMeInput) =>
  (await api.patch<MeDto>('/users/me', input)).data;
export const getFriends = async () => (await api.get<PublicUserDto[]>('/users/me/friends')).data;
export const addFriend = async (id: string) =>
  (await api.post<PublicUserDto>(`/users/${id}/friend`)).data;
export const removeFriend = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}/friend`);
};
