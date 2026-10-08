import { create, isAxiosError, isCancel } from 'axios';

import { useAuthStore } from '@/stores/auth-store';

export const api = create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

api.interceptors.response.use(undefined, (error: unknown) => {
  if (isCancel(error)) return Promise.reject(error); // an aborted request is not a failure
  if (isAxiosError(error) && error.response?.status === 401) useAuthStore.getState().logout();
  return Promise.reject(new Error(toErrorMessage(error)));
});

/** The sentence to show for a failed request: the server's own words when it gave any. */
export function toErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) return 'Cannot reach the server. Check your connection.';
    const message = (error.response.data as { message?: unknown } | undefined)?.message;
    if (Array.isArray(message)) return message.join('\n'); // validation: "field: problem" lines
    if (typeof message === 'string') return message;
    return 'Something went wrong';
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}
