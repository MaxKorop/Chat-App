import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderHookOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';

import { makeMe } from './factories';

/** A client for tests: no retries, no global error toasts, and cached data counts as fresh (so seeding it does not trigger a fetch). */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(ui: ReactElement, queryClient = createTestQueryClient()) {
  return { queryClient, ...render(ui, { wrapper: makeWrapper(queryClient) }) };
}

export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> & { queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  return { queryClient, ...renderHook(hook, { ...options, wrapper: makeWrapper(queryClient) }) };
}

/** Makes `me` the logged-in user: a token, and the user cached where `useMe()` looks. */
export function loginAs(queryClient: QueryClient, me = makeMe()) {
  useAuthStore.setState({ token: 'test-token' });
  queryClient.setQueryData(userKeys.me, me);
  return me;
}
