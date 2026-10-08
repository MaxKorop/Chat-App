import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as chatsApi from '@/features/chats/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import * as api from './api';
import { UserProfileDialog } from './UserProfileDialog';

vi.mock('./api');
vi.mock('@/features/chats/api');

const BOB = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';
function open(user = makeUser({ id: BOB, username: 'bob' })) {
  vi.mocked(api.getUser).mockResolvedValue(user);
  useChatUiStore.getState().showProfile(user.id);
  const view = renderWithProviders(<UserProfileDialog />);
  loginAs(view.queryClient);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
});

describe('UserProfileDialog', () => {
  it('is closed when no profile is being shown', () => {
    renderWithProviders(<UserProfileDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the name, the about text and when the person was last online', async () => {
    open(
      makeUser({
        id: BOB,
        username: 'bob',
        about: 'Database nerd',
        isOnline: false,
        lastSeenAt: null,
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'bob' })).toBeInTheDocument();
    expect(screen.getByText('Database nerd')).toBeInTheDocument();
    expect(screen.getByText('last seen recently')).toBeInTheDocument();
  });

  it('shows "online" with a marker for somebody who is online', async () => {
    open(makeUser({ id: BOB, username: 'bob', isOnline: true }));
    expect(await screen.findByText('online')).toBeInTheDocument();
    expect(screen.getByLabelText('online')).toBeInTheDocument();
  });

  it('lets you add a stranger as a friend', async () => {
    vi.mocked(api.addFriend).mockResolvedValue(makeUser({ id: BOB, isFriend: true }));
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Add friend' }));
    await waitFor(() => expect(api.addFriend).toHaveBeenCalled());
    expect(vi.mocked(api.addFriend).mock.calls[0]![0]).toBe(BOB);
  });

  it('explains why somebody cannot be added when they do not accept friend requests', async () => {
    open(makeUser({ id: BOB, username: 'bob', allowFriendRequests: false }));
    expect(await screen.findByRole('button', { name: 'Add friend' })).toBeDisabled();
    expect(screen.getByText(/does not accept friend requests/i)).toBeInTheDocument();
  });

  it('for a friend: messages them (opens the direct chat) or removes them', async () => {
    vi.mocked(chatsApi.createChat).mockResolvedValue(makeChatDetails({ id: 'dm-1' }));
    vi.mocked(api.removeFriend).mockResolvedValue(undefined);
    const user = userEvent.setup();
    open(makeUser({ id: BOB, username: 'bob', isFriend: true }));

    await user.click(await screen.findByRole('button', { name: 'Message' }));
    await waitFor(() => expect(useChatUiStore.getState().activeChatId).toBe('dm-1'));
    expect(vi.mocked(chatsApi.createChat).mock.calls[0]![0]).toEqual({
      type: 'DIRECT',
      userId: BOB,
    });
    expect(useChatUiStore.getState().profileUserId).toBeNull(); // the dialog closes

    useChatUiStore.getState().showProfile(BOB);
    await user.click(await screen.findByRole('button', { name: 'Remove friend' }));
    await waitFor(() => expect(api.removeFriend).toHaveBeenCalled());
  });

  it('offers no friend actions on your own profile', async () => {
    open(makeUser({ id: 'user-1', username: 'alice' }));
    await screen.findByRole('dialog', { name: 'alice' });
    expect(screen.queryByRole('button', { name: /friend|message/i })).not.toBeInTheDocument();
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(useChatUiStore.getState().profileUserId).toBeNull());
  });
});
