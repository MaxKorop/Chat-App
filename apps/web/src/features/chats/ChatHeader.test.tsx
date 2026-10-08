import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as usersApi from '@/features/users/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { useTypingStore } from '@/stores/typing-store';
import { makeChatDetails, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import { ChatHeader } from './ChatHeader';

vi.mock('@/features/users/api');

const group = makeChatDetails({ id: 'g1', title: 'Study group', type: 'GROUP' });
const dm = makeChatDetails({
  id: 'd1',
  title: 'bob',
  type: 'DIRECT',
  members: [
    { userId: 'user-1', username: 'alice', role: 'MEMBER', lastReadSeq: 0 },
    { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: 0 },
  ],
});

function show(chat = group) {
  const view = renderWithProviders(<ChatHeader chat={chat} />);
  loginAs(view.queryClient);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
  useTypingStore.getState().reset();
});

describe('ChatHeader', () => {
  it('shows the name of a group and how many people are in it', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Study group' })).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('shows whether the other person of a direct chat is online', async () => {
    vi.mocked(usersApi.getUser).mockResolvedValue(
      makeUser({ id: 'user-2', username: 'bob', isOnline: true }),
    );
    show(dm);
    expect(await screen.findByText('online')).toBeInTheDocument();
    expect(vi.mocked(usersApi.getUser).mock.calls[0]![0]).toBe('user-2'); // the other member, not me
  });

  it('shows when the other person was last seen', async () => {
    vi.mocked(usersApi.getUser).mockResolvedValue(
      makeUser({ id: 'user-2', isOnline: false, lastSeenAt: null }),
    );
    show(dm);
    expect(await screen.findByText('last seen recently')).toBeInTheDocument();
  });

  it('says who is typing, instead of the status', () => {
    show();
    act(() => useTypingStore.getState().set('g1', 'user-2', 'bob', true));
    expect(screen.getByText('bob is typing…')).toBeInTheDocument();
    expect(screen.queryByText('2 members')).not.toBeInTheDocument();
    act(() => useTypingStore.getState().set('g1', 'user-3', 'carol', true));
    expect(screen.getByText('bob, carol are typing…')).toBeInTheDocument();
  });

  it('goes back to the chat list (on small screens, where the list is hidden behind the chat)', async () => {
    useChatUiStore.getState().openChat('g1');
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(useChatUiStore.getState().activeChatId).toBeNull();
  });

  it('opens the chat information when the name is clicked', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /Study group/ }));
    expect(useChatUiStore.getState().dialog).toBe('chatInfo');
  });
});
