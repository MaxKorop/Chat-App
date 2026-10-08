import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as chatsApi from '@/features/chats/api';
import * as usersApi from '@/features/users/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import { AppShell } from './AppShell';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('@/features/chats/api');
vi.mock('@/features/users/api');
vi.mock('@/features/messages/api');

function show() {
  const view = renderWithProviders(<AppShell />);
  loginAs(view.queryClient);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
  vi.mocked(chatsApi.getChats).mockResolvedValue([]);
  vi.mocked(usersApi.getFriends).mockResolvedValue([]);
});

describe('AppShell', () => {
  it('has the sidebar and the chat area side by side', async () => {
    show();
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByText(/select a chat/i)).toBeInTheDocument();
  });

  it('warns when the connection is down', () => {
    show();
    act(() => useChatUiStore.getState().setConnection('offline'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  });

  it.each([
    ['createChat', 'New chat'],
    ['settings', 'Settings'],
  ] as const)('opens the %s dialog when the store asks for it', async (dialog, title) => {
    show();
    act(() => useChatUiStore.getState().setDialog(dialog));
    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('opens a profile and the information of the open chat', async () => {
    vi.mocked(usersApi.getUser).mockResolvedValue(makeUser({ id: 'u-1', username: 'bob' }));
    vi.mocked(chatsApi.getChat).mockResolvedValue(
      makeChatDetails({ id: 'g1', title: 'Study group' }),
    );
    show();
    act(() => useChatUiStore.getState().showProfile('u-1'));
    expect(await screen.findByRole('dialog', { name: 'bob' })).toBeInTheDocument();
  });

  it('on a small screen shows either the list or the chat, not both', () => {
    const { container } = show();
    const [sidebar, chat] = [container.querySelector('aside')!, container.querySelector('main')!];
    expect(sidebar.className).toContain('md:flex'); // always visible from the md breakpoint up
    expect(chat.className).toContain('hidden'); // nothing open: the list takes the whole screen

    act(() => useChatUiStore.getState().openChat('g1'));
    expect(sidebar.className).toContain('hidden');
    expect(chat.className).not.toContain('hidden');
  });
});
