import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { queryClient } from '@/lib/query-client';

import { useAuthStore } from './auth-store';
import { useChatUiStore } from './chat-ui-store';
import { usePendingStore } from './pending-store';

beforeEach(() => {
  useAuthStore.setState({ token: null });
  queryClient.clear();
});
afterEach(() => {
  useChatUiStore.getState().reset();
  usePendingStore.getState().reset();
});

describe('useAuthStore', () => {
  it('starts logged out', () => {
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('remembers the token across page loads (localStorage)', async () => {
    useAuthStore.getState().setToken('abc.def.ghi');
    expect(JSON.parse(localStorage.getItem('auth')!).state.token).toBe('abc.def.ghi');

    // a fresh page load: the in-memory state is gone, but what was saved is still in localStorage
    const saved = localStorage.getItem('auth')!;
    useAuthStore.setState({ token: null }); // (this also overwrites the saved value, as a test shortcut)
    localStorage.setItem('auth', saved);
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().token).toBe('abc.def.ghi');
  });

  it('forgets the token on logout', () => {
    useAuthStore.getState().setToken('abc');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(JSON.parse(localStorage.getItem('auth')!).state.token).toBeNull();
  });

  it('wipes everything that belonged to the user on logout, so the next person starts clean', () => {
    useAuthStore.getState().setToken('abc');
    queryClient.setQueryData(['chats'], [{ id: 'private chat' }]);
    useChatUiStore.getState().openChat('chat-1');
    usePendingStore.getState().upsert({
      clientId: 'c1',
      chatId: 'chat-1',
      files: [],
      status: 'sending',
      createdAt: new Date().toISOString(),
    });

    useAuthStore.getState().logout();

    expect(queryClient.getQueryData(['chats'])).toBeUndefined();
    expect(useChatUiStore.getState().activeChatId).toBeNull();
    expect(usePendingStore.getState().byChat).toEqual({});
  });
});
