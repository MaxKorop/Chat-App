import type { MessagesPage } from '@chat/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatKeys } from '@/lib/query-keys';
import { usePendingStore } from '@/stores/pending-store';
import { makeMessage } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { createTestQueryClient, renderHookWithProviders } from '@/test/utils';

import * as api from './api';
import { flattenMessages } from './cache';
import { useDeleteMessage, useEditMessage, useMessages, useSendMessage } from './queries';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('./api', () => ({
  getMessages: vi.fn<typeof api.getMessages>(),
  uploadAttachments: vi.fn<typeof api.uploadAttachments>(),
}));

type Pages = InfiniteData<MessagesPage, number | undefined>;
const CHAT = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const stored = (seq: number, patch = {}) =>
  makeMessage({ id: `m${seq}`, chatId: CHAT, seq, ...patch });
const pendingList = () => usePendingStore.getState().byChat[CHAT] ?? [];
const photo = () => new File(['x'], 'cat.png', { type: 'image/png' });

let qc: ReturnType<typeof createTestQueryClient>;
beforeEach(() => {
  fakeSocket.reset();
  usePendingStore.getState().reset();
  vi.mocked(api.getMessages).mockReset();
  vi.mocked(api.uploadAttachments).mockReset();
  qc = createTestQueryClient();
  qc.setQueryData<Pages>(chatKeys.messages(CHAT), {
    pages: [{ items: [stored(1)], nextBefore: null }],
    pageParams: [undefined],
  });
});

describe('useMessages', () => {
  it('loads the newest page and pages backwards with nextBefore', async () => {
    qc.clear();
    vi.mocked(api.getMessages)
      .mockResolvedValueOnce({ items: [stored(5), stored(4)], nextBefore: 4 })
      .mockResolvedValueOnce({ items: [stored(3)], nextBefore: null });
    const { result } = renderHookWithProviders(() => useMessages(CHAT), { queryClient: qc });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(flattenMessages(result.current.data).map((m) => m.seq)).toEqual([5, 4]);
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());
    expect(vi.mocked(api.getMessages).mock.calls.map(([, before]) => before)).toEqual([
      undefined,
      4,
    ]);
    await waitFor(() =>
      expect(flattenMessages(result.current.data).map((m) => m.seq)).toEqual([5, 4, 3]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useSendMessage', () => {
  const send = () =>
    renderHookWithProviders(() => useSendMessage(CHAT), { queryClient: qc }).result;

  it('shows the message at once as "sending", then swaps it for the stored one when the server confirms', async () => {
    let confirm!: (answer: unknown) => void;
    fakeSocket.ackResponder = () => new Promise((resolve) => (confirm = resolve));
    const mutation = send();

    let done!: Promise<void>;
    act(() => {
      done = mutation.current.mutateAsync({ content: 'hello', files: [] });
    });
    await waitFor(() => expect(pendingList()).toHaveLength(1));
    expect(pendingList()[0]).toMatchObject({ content: 'hello', status: 'sending', chatId: CHAT });

    await act(async () => {
      confirm({ ok: true, data: stored(2, { content: 'hello' }) });
      await done;
    });
    expect(pendingList()).toEqual([]);
    expect(
      flattenMessages(qc.getQueryData<Pages>(chatKeys.messages(CHAT))).map((m) => m.seq),
    ).toEqual([2, 1]);
  });

  it('sends the text, the reply target and a clientId that the server can de-duplicate on', async () => {
    fakeSocket.ackResponder = () => ({ ok: true, data: stored(2) });
    const mutation = send();
    await act(() => mutation.current.mutateAsync({ content: 'hi', replyToId: 'm1', files: [] }));

    const payload = fakeSocket.sent('message:send')[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      chatId: CHAT,
      content: 'hi',
      replyToId: 'm1',
      attachmentIds: [],
    });
    expect(payload.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uploads the files first (over REST) and sends their ids with the message', async () => {
    vi.mocked(api.uploadAttachments).mockResolvedValue([
      { id: 'a1', fileName: 'cat.png', mimeType: 'image/png', size: 1, url: 'http://s3/a1' },
    ]);
    fakeSocket.ackResponder = () => ({ ok: true, data: stored(2) });
    const mutation = send();
    await act(() => mutation.current.mutateAsync({ files: [photo()] }));

    expect(api.uploadAttachments).toHaveBeenCalledTimes(1);
    expect(fakeSocket.sent('message:send')[0]).toMatchObject({ attachmentIds: ['a1'] });
  });

  it('marks the message as failed with the server’s reason, and keeps it so the user can retry', async () => {
    fakeSocket.ackResponder = () => ({ ok: false, error: 'You are not a member of this chat' });
    const mutation = send();
    await act(async () => {
      await expect(mutation.current.mutateAsync({ content: 'hello', files: [] })).rejects.toThrow(
        'You are not a member of this chat',
      );
    });
    expect(pendingList()[0]).toMatchObject({
      status: 'failed',
      error: 'You are not a member of this chat',
      content: 'hello',
    });
  });

  it('retrying reuses the clientId and the already uploaded files, so nothing is sent twice', async () => {
    vi.mocked(api.uploadAttachments).mockResolvedValue([
      { id: 'a1', fileName: 'cat.png', mimeType: 'image/png', size: 1, url: 'http://s3/a1' },
    ]);
    fakeSocket.ackResponder = () => {
      throw new Error('operation has timed out'); // the first attempt gets no answer
    };
    const mutation = send();
    await act(async () => {
      await expect(
        mutation.current.mutateAsync({ content: 'photo', files: [photo()] }),
      ).rejects.toThrow('No connection to the server');
    });
    const failed = pendingList()[0]!;
    expect(failed).toMatchObject({ status: 'failed', attachmentIds: ['a1'] });

    fakeSocket.ackResponder = () => ({ ok: true, data: stored(2, { clientId: failed.clientId }) });
    await act(() => mutation.current.mutateAsync({ ...failed }));

    expect(api.uploadAttachments).toHaveBeenCalledTimes(1); // not uploaded again
    const [first, second] = fakeSocket.sent('message:send') as {
      clientId: string;
      attachmentIds: string[];
    }[];
    expect(second!.clientId).toBe(first!.clientId); // the server recognises the retry
    expect(second!.attachmentIds).toEqual(['a1']);
    expect(pendingList()).toEqual([]);
  });

  it('a failed upload fails the message before anything is sent over the socket', async () => {
    vi.mocked(api.uploadAttachments).mockRejectedValue(
      new Error('Only PNG, JPEG, GIF and WebP images can be uploaded'),
    );
    const mutation = send();
    await act(async () => {
      await expect(mutation.current.mutateAsync({ files: [photo()] })).rejects.toThrow('Only PNG');
    });
    expect(fakeSocket.sent('message:send')).toEqual([]);
    expect(pendingList()[0]).toMatchObject({ status: 'failed' });
  });
});

describe('useEditMessage and useDeleteMessage', () => {
  it('send their command over the socket and surface a refusal as an error', async () => {
    fakeSocket.ackResponder = () => ({ ok: true, data: stored(1) });
    const edit = renderHookWithProviders(() => useEditMessage(), { queryClient: qc }).result;
    await act(() => edit.current.mutateAsync({ messageId: 'm1', content: 'fixed' }));
    expect(fakeSocket.sent('message:edit')).toEqual([{ messageId: 'm1', content: 'fixed' }]);

    fakeSocket.ackResponder = () => ({ ok: false, error: 'You cannot delete this message' });
    const remove = renderHookWithProviders(() => useDeleteMessage(), { queryClient: qc }).result;
    await act(async () => {
      await expect(remove.current.mutateAsync({ messageId: 'm1' })).rejects.toThrow(
        'You cannot delete this message',
      );
    });
  });
});
