import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn<(message: string, options?: { id: string }) => void>(),
}));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { queryClient } from './query-client';

beforeEach(() => {
  toastError.mockClear();
  queryClient.clear();
});

describe('the app’s query client', () => {
  it('shows every failed query as an error toast, instead of each screen doing it', async () => {
    await queryClient
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(new Error('Chat not found')),
        retry: false,
      })
      .catch(() => undefined);
    expect(toastError).toHaveBeenCalledWith('Chat not found', { id: 'Chat not found' });
  });

  it('shows the same problem once even when several requests fail with it (the network dropped)', async () => {
    const fail = () =>
      queryClient
        .fetchQuery({
          queryKey: [Math.random()],
          queryFn: () => Promise.reject(new Error('Cannot reach the server')),
          retry: false,
        })
        .catch(() => undefined);
    await Promise.all([fail(), fail(), fail()]);
    const ids = toastError.mock.calls.map(([, options]) => options?.id);
    expect(ids).toEqual([
      'Cannot reach the server',
      'Cannot reach the server',
      'Cannot reach the server',
    ]); // same id: sonner replaces instead of stacking
  });

  it('does the same for failed mutations', async () => {
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(new Error('Message not delivered')) })
      .execute(undefined)
      .catch(() => undefined);
    expect(toastError).toHaveBeenCalledWith('Message not delivered', {
      id: 'Message not delivered',
    });
  });

  it('keeps data fresh for 30 seconds and retries a failed query once', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, retry: 1 });
  });
});
