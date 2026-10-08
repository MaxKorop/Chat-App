// The query hooks of auth, users and chats: what they fetch, when, and what they refresh afterwards.
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatKeys, userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { makeChatDetails, makeChatSummary, makeMe, makeUser } from '@/test/factories';
import { createTestQueryClient, renderHookWithProviders } from '@/test/utils';

import * as authApi from './auth/api';
import { useLogIn, useMe, useSignUp } from './auth/queries';
import * as chatsApi from './chats/api';
import { useChat, useChatSearch, useChats, useCreateChat, useJoinChat } from './chats/queries';
import * as usersApi from './users/api';
import {
  useAddFriend,
  useFriends,
  useRemoveFriend,
  useUpdateMe,
  useUser,
  useUserSearch,
} from './users/queries';

vi.mock('./auth/api');
vi.mock('./chats/api');
vi.mock('./users/api');

let qc: ReturnType<typeof createTestQueryClient>;
let invalidate: ReturnType<typeof vi.spyOn>;
const hook = <T,>(use: () => T) => renderHookWithProviders(use, { queryClient: qc }).result;

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ token: null });
  qc = createTestQueryClient();
  invalidate = vi.spyOn(qc, 'invalidateQueries');
});

describe('auth', () => {
  const session = { accessToken: 'jwt-1', user: makeMe() };

  it.each([
    [
      'logIn',
      () => useLogIn(),
      () => vi.mocked(authApi.logIn).mockResolvedValue(session),
      { username: 'alice', password: 'password123' },
    ],
    [
      'signUp',
      () => useSignUp(),
      () => vi.mocked(authApi.signUp).mockResolvedValue(session),
      { email: 'a@example.com', username: 'alice', password: 'password123' },
    ],
  ] as const)(
    '%s stores the token and the user, which logs the user in',
    async (_name, use, arrange, credentials) => {
      arrange();
      const mutation = hook(use as () => ReturnType<typeof useLogIn>);
      await act(() => mutation.current.mutateAsync(credentials as never));
      expect(useAuthStore.getState().token).toBe('jwt-1');
      expect(qc.getQueryData(userKeys.me)).toEqual(session.user);
    },
  );

  it('useMe asks the server who is logged in, but only when there is a token', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(makeMe());
    hook(() => useMe());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(authApi.getMe).not.toHaveBeenCalled();

    useAuthStore.setState({ token: 'jwt-1' });
    const result = hook(() => useMe());
    await waitFor(() => expect(result.current.data).toMatchObject({ username: 'alice' }));
  });
});

describe('users', () => {
  it('search waits for something to search for, and a blank search never asks the server', async () => {
    vi.mocked(usersApi.searchUsers).mockResolvedValue([makeUser()]);
    const blank = hook(() => useUserSearch('   '));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.searchUsers).not.toHaveBeenCalled();
    expect(blank.current.data).toBeUndefined();

    const found = hook(() => useUserSearch('bo'));
    await waitFor(() => expect(found.current.data).toHaveLength(1));
    expect(vi.mocked(usersApi.searchUsers).mock.calls[0]![0]).toBe('bo');
  });

  it('loads a profile and the friends list', async () => {
    vi.mocked(usersApi.getUser).mockResolvedValue(makeUser({ username: 'bob' }));
    vi.mocked(usersApi.getFriends).mockResolvedValue([makeUser({ username: 'carol' })]);
    const profile = hook(() => useUser('user-2'));
    const friends = hook(() => useFriends());
    await waitFor(() => expect(profile.current.data?.username).toBe('bob'));
    await waitFor(() => expect(friends.current.data?.[0]?.username).toBe('carol'));
  });

  it('updating the profile refreshes the cached current user', async () => {
    vi.mocked(usersApi.updateMe).mockResolvedValue(makeMe({ about: 'new about' }));
    const mutation = hook(() => useUpdateMe());
    await act(() => mutation.current.mutateAsync({ about: 'new about' }));
    expect(qc.getQueryData(userKeys.me)).toMatchObject({ about: 'new about' });
  });

  it('adding or removing a friend refreshes the friends list and everything that shows "is friend"', async () => {
    vi.mocked(usersApi.addFriend).mockResolvedValue(makeUser({ isFriend: true }));
    vi.mocked(usersApi.removeFriend).mockResolvedValue(undefined);
    const add = hook(() => useAddFriend());
    const remove = hook(() => useRemoveFriend());

    await act(() => add.current.mutateAsync('user-2'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.friends });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
    invalidate.mockClear();
    await act(() => remove.current.mutateAsync('user-2'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.friends });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });
});

describe('chats', () => {
  it('loads the chat list and one chat’s details', async () => {
    vi.mocked(chatsApi.getChats).mockResolvedValue([makeChatSummary()]);
    vi.mocked(chatsApi.getChat).mockResolvedValue(makeChatDetails({ id: 'chat-1' }));
    const list = hook(() => useChats());
    const details = hook(() => useChat('chat-1'));
    await waitFor(() => expect(list.current.data).toHaveLength(1));
    await waitFor(() => expect(details.current.data?.id).toBe('chat-1'));
  });

  it('does not ask for a chat when none is selected', async () => {
    hook(() => useChat(null));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chatsApi.getChat).not.toHaveBeenCalled();
  });

  it('chat search skips blank queries', async () => {
    vi.mocked(chatsApi.searchChats).mockResolvedValue([makeChatSummary({ isMember: false })]);
    hook(() => useChatSearch(''));
    const found = hook(() => useChatSearch('study'));
    await waitFor(() => expect(found.current.data).toHaveLength(1));
    expect(chatsApi.searchChats).toHaveBeenCalledTimes(1);
  });

  it('creating a chat caches its details and refreshes the list, and hands the chat back to the caller', async () => {
    const created = makeChatDetails({ id: 'new-chat' });
    vi.mocked(chatsApi.createChat).mockResolvedValue(created);
    const mutation = hook(() => useCreateChat());
    const result = await act(() =>
      mutation.current.mutateAsync({ type: 'DIRECT', userId: 'user-2' }),
    );
    expect(result).toEqual(created);
    expect(qc.getQueryData(chatKeys.detail('new-chat'))).toEqual(created);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
  });

  it('joining a chat caches the details (now with members) and refreshes the list', async () => {
    const joined = makeChatDetails({ id: 'public-1', isMember: true });
    vi.mocked(chatsApi.joinChat).mockResolvedValue(joined);
    const mutation = hook(() => useJoinChat());
    await act(() => mutation.current.mutateAsync('public-1'));
    expect(qc.getQueryData(chatKeys.detail('public-1'))).toEqual(joined);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.list, exact: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chats', 'search'] });
  });
});
