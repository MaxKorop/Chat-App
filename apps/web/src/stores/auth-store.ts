import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { queryClient } from '@/lib/query-client';

import { useChatUiStore } from './chat-ui-store';
import { usePendingStore } from './pending-store';
import { useTypingStore } from './typing-store';

type AuthState = {
  token: string | null;
  setToken: (token: string) => void;
  /** forgets the token AND everything that belonged to the user, so the next person starts clean */
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      logout: () => {
        set({ token: null });
        queryClient.clear();
        useChatUiStore.getState().reset();
        usePendingStore.getState().reset();
        useTypingStore.getState().reset();
      },
    }),
    { name: 'auth', partialize: ({ token }) => ({ token }) },
  ),
);
