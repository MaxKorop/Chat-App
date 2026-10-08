import type { LogInInput, MeDto, SignUpInput } from '@chat/shared';

import { api } from '@/lib/api-client';

export type Session = { accessToken: string; user: MeDto };

export const signUp = async (input: SignUpInput) =>
  (await api.post<Session>('/auth/sign-up', input)).data;
export const logIn = async (input: LogInInput) =>
  (await api.post<Session>('/auth/log-in', input)).data;
export const getMe = async () => (await api.get<MeDto>('/auth/me')).data;
