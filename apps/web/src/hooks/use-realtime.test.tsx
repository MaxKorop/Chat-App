import type { ChatDetailsDto, MessagesPage } from '@chat/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flattenMessages } from '@/features/messages/cache';
import { chatKeys, userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { useTypingStore } from '@/stores/typing-store';
import { makeChatDetails, makeMe, makeMessage } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { createTestQueryClient, renderHookWithProviders } from '@/test/utils';

import { useRealtime } from './use-realtime';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);

type Pages = InfiniteData<MessagesPage, number | undefined>;
const CHAT = 'chat-1';

let qc: ReturnType<typeof createTestQueryClient>;
let invalidate: ReturnType<typeof vi.spyOn>;
const mount = () => renderHookWithProviders(() => useRealtime(), { queryClient: qc });
const messagesInCache = () => flattenMessages(qc.getQueryData<Pages>(chatKeys.messages(CHAT)));

beforeEach(() => {
  fakeSocket.reset();
  useAuthStore.setState({ token: 'token-1' });
  useChatUiStore.getState().reset();
  useTypingStore.getState().reset();
  qc = createTestQueryClient();
  invalidate = vi.spyOn(qc, 'invalidateQueries');
  qc.setQueryData(userKeys.me, makeMe({ id: 'user-1' }));
  qc.setQueryData<Pages>(chatKeys.messages(CHAT), {
    pages: [{ items: [makeMessage({ id: 'm1', seq: 1, chatId: CHAT })], nextBefore: null }],
    pageParams: [undefined],
  });
});

describe('connection lifecycle', () => {
  it('connects when there is a token, and not before', () => {
    useAuthStore.setState({ token: null });
    mount();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('shows "connecting" first and "online" once the server has accepted the connection', () => {
    mount();
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    expect(useChatUiStore.getState().connection).toBe('connecting');
    fakeSocket.receive('connect');
    expect(useChatUiStore.getState().connection).toBe('online');
  });

  it('disconnects and forgets its listeners when the component goes away or the user logs out', () => {
    const { unmount } = mount();
    expect(fakeSocket.listenerCount('message:created')).toBe(1);
    unmount();
    expect(fakeSocket.removeAllListeners).toHaveBeenCalled();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(fakeSocket.listenerCount('message:created')).toBe(0);
  });

  it('does not refetch on the very first connection, but does on every reconnect', () => {
    mount();
    fakeSocket.receive('connect');
    expect(invalidate).not.toHaveBeenCalled(); // the screens have just fetched

    fakeSocket.receive('disconnect', 'transport close');
    expect(useChatUiStore.getState().connection).toBe('offline');
    fakeSocket.receive('connect');
    expect(useChatUiStore.getState().connection).toBe('online');
    // anything could have happened while offline: chats, history and who is online
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('reconnects by itself when the server closed the connection (for example an expired token)', () => {
    mount();
    fakeSocket.receive('connect');
    fakeSocket.connect.mockClear();
    fakeSocket.receive('disconnect', 'io server disconnect');
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('leaves other disconnects to Socket.IO’s own automatic reconnect', () => {
    mount();
    fakeSocket.receive('connect');
    fakeSocket.connect.mockClear();
    fakeSocket.receive('disconnect', 'transport close');
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('logs the user out when the server refuses the token, but just shows "offline" for other errors', () => {
    mount();
    fakeSocket.receive('connect_error', new Error('Server error'));
    expect(useAuthStore.getState().token).toBe('token-1');
    expect(useChatUiStore.getState().connection).toBe('offline');

    fakeSocket.receive('connect_error', new Error('Unauthorized'));
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('events from the server', () => {
  beforeEach(() => mount());

  it('message:created adds the message to the open history and refreshes the chat list', () => {
    fakeSocket.receive('message:created', makeMessage({ id: 'm2', seq: 2, chatId: CHAT }));
    expect(messagesInCache().map((m) => m.seq)).toEqual([2, 1]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
  });

  it('message:created for a message already shown (our own, acknowledged earlier) is not added twice', () => {
    const message = makeMessage({ id: 'm2', seq: 2, chatId: CHAT });
    fakeSocket.receive('message:created', message);
    fakeSocket.receive('message:created', message);
    expect(messagesInCache()).toHaveLength(2);
  });

  it('message:updated replaces the message in place', () => {
    fakeSocket.receive(
      'message:updated',
      makeMessage({
        id: 'm1',
        seq: 1,
        chatId: CHAT,
        content: 'edited',
        editedAt: '2026-01-05T11:00:00.000Z',
      }),
    );
    expect(messagesInCache()[0]).toMatchObject({
      content: 'edited',
      editedAt: '2026-01-05T11:00:00.000Z',
    });
  });

  it('message:deleted removes the message and refreshes the chat list (preview and unread count change)', () => {
    fakeSocket.receive('message:deleted', { chatId: CHAT, messageId: 'm1' });
    expect(messagesInCache()).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
  });

  it('chat:read of somebody else moves their read cursor in the chat details (this drives the read ticks)', () => {
    qc.setQueryData<ChatDetailsDto>(chatKeys.detail(CHAT), makeChatDetails({ id: CHAT }));
    fakeSocket.receive('chat:read', { chatId: CHAT, userId: 'user-2', seq: 5 });
    const members = qc.getQueryData<ChatDetailsDto>(chatKeys.detail(CHAT))!.members;
    expect(members.find((m) => m.userId === 'user-2')!.lastReadSeq).toBe(5);
    expect(members.find((m) => m.userId === 'user-1')!.lastReadSeq).toBe(0);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
  });

  it('chat:read never moves a cursor backwards', () => {
    qc.setQueryData<ChatDetailsDto>(chatKeys.detail(CHAT), makeChatDetails({ id: CHAT }));
    fakeSocket.receive('chat:read', { chatId: CHAT, userId: 'user-2', seq: 5 });
    fakeSocket.receive('chat:read', { chatId: CHAT, userId: 'user-2', seq: 3 });
    expect(qc.getQueryData<ChatDetailsDto>(chatKeys.detail(CHAT))!.members[1]!.lastReadSeq).toBe(5);
  });

  it('chat:read of ours (from another tab) refreshes the unread badge', () => {
    fakeSocket.receive('chat:read', { chatId: CHAT, userId: 'user-1', seq: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
  });

  it('typing shows who is typing, and presence refreshes that user', () => {
    fakeSocket.receive('typing', {
      chatId: CHAT,
      userId: 'user-2',
      username: 'bob',
      isTyping: true,
    });
    expect(useTypingStore.getState().namesIn(CHAT)).toEqual(['bob']);

    fakeSocket.receive('presence:changed', { userId: 'user-2', isOnline: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.detail('user-2') });
  });

  it('chat:changed refreshes the chat list (a chat was created with us in it, or we joined one)', () => {
    fakeSocket.receive('chat:changed', { chatId: CHAT });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list });
  });
});
