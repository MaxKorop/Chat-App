import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as messagesApi from '@/features/messages/api';
import * as usersApi from '@/features/users/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import * as api from './api';
import { ChatView } from './ChatView';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('./api');
vi.mock('@/features/messages/api');
vi.mock('@/features/users/api');

function show(activeChatId: string | null = null) {
  useChatUiStore.getState().openChat(activeChatId);
  const view = renderWithProviders(<ChatView />);
  loginAs(view.queryClient);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
  vi.mocked(messagesApi.getMessages).mockResolvedValue({ items: [], nextBefore: null });
  vi.mocked(usersApi.getUser).mockResolvedValue(makeUser({ id: 'user-2' }));
});

describe('ChatView', () => {
  it('invites to pick a chat when none is open', () => {
    show();
    expect(screen.getByText(/select a chat/i)).toBeInTheDocument();
  });

  it('shows a placeholder while the chat loads', () => {
    vi.mocked(api.getChat).mockReturnValue(new Promise(() => undefined));
    show('g1');
    expect(screen.getByLabelText('Loading chat')).toBeInTheDocument();
  });

  it('for a member: the header, the messages and the composer', async () => {
    vi.mocked(api.getChat).mockResolvedValue(
      makeChatDetails({ id: 'g1', title: 'Study group', isMember: true }),
    );
    show('g1');
    expect(await screen.findByRole('heading', { name: 'Study group' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders a chat without React warnings (for example two siblings with the same key)', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(api.getChat).mockResolvedValue(
      makeChatDetails({ id: 'g1', title: 'Study group', isMember: true }),
    );
    show('g1');
    await screen.findByRole('textbox', { name: 'Message' });
    await screen.findByText(/no messages yet/i);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('for a public group I have not joined: a preview with a join button, and no way to write', async () => {
    vi.mocked(api.getChat).mockResolvedValue(
      makeChatDetails({
        id: 'p1',
        title: 'Public club',
        isMember: false,
        isPublic: true,
        members: [],
      }),
    );
    show('p1');
    expect(await screen.findByRole('button', { name: 'Join group' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    expect(messagesApi.getMessages).not.toHaveBeenCalled(); // the history is for members
  });

  it('when the chat cannot be opened: says so and offers a way back', async () => {
    vi.mocked(api.getChat).mockRejectedValue(new Error('You are not a member of this chat'));
    const user = userEvent.setup();
    show('secret');
    expect(await screen.findByText(/this chat is not available/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(useChatUiStore.getState().activeChatId).toBeNull();
  });

  it('starts every chat with an empty composer: a draft does not follow me to another chat', async () => {
    vi.mocked(api.getChat).mockImplementation(async (id) =>
      makeChatDetails({ id, title: id, isMember: true }),
    );
    const user = userEvent.setup();
    show('g1');
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'half-written');

    act(() => useChatUiStore.getState().openChat('g2'));
    expect(await screen.findByRole('heading', { name: 'g2' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });
});
