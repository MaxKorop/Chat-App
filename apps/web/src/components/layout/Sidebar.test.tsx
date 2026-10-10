import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as chatsApi from '@/features/chats/api';
import * as usersApi from '@/features/users/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatSummary, makeMe, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import { Sidebar } from './Sidebar';

vi.mock('@/features/chats/api');
vi.mock('@/features/users/api');

function renderSidebar() {
  const view = renderWithProviders(<Sidebar />);
  loginAs(view.queryClient, makeMe({ username: 'alice' }));
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
  vi.mocked(chatsApi.getChats).mockResolvedValue([
    makeChatSummary({ id: 'a', title: 'Study group' }),
  ]);
  vi.mocked(chatsApi.searchChats).mockResolvedValue([]);
  vi.mocked(usersApi.searchUsers).mockResolvedValue([]);
});

describe('Sidebar', () => {
  it('shows my chats and who I am', async () => {
    renderSidebar();
    expect(await screen.findByText('Study group')).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
  });

  it('shows the app name with its logo above the search', async () => {
    const { container } = renderSidebar();
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument();
    expect(container.querySelector('aside svg')).toBeInTheDocument();
    await screen.findByText('Study group');
  });

  it('opens the dialogs for creating a chat and for settings', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(useChatUiStore.getState().dialog).toBe('createChat');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(useChatUiStore.getState().dialog).toBe('settings');
  });

  describe('search', () => {
    it('is cleared when a chat gets opened from elsewhere (for example "Message" in a profile)', async () => {
      const user = userEvent.setup();
      renderSidebar();
      await screen.findByText('Study group');
      const box = screen.getByRole('searchbox', { name: 'Search' });
      await user.type(box, 'carol');

      act(() => useChatUiStore.getState().openChat('a'));
      expect(box).toHaveValue('');
      expect(await screen.findByText('Study group')).toBeInTheDocument();
    });

    it('replaces the chat list with results once something is typed, and brings it back when cleared', async () => {
      vi.mocked(chatsApi.searchChats).mockResolvedValue([
        makeChatSummary({ id: 'p', title: 'Public club', isPublic: true, isMember: false }),
      ]);
      const user = userEvent.setup();
      renderSidebar();
      await screen.findByText('Study group');

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'club');
      expect(await screen.findByText('Public club')).toBeInTheDocument();
      expect(screen.queryByText('Study group')).not.toBeInTheDocument();

      await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
      expect(await screen.findByText('Study group')).toBeInTheDocument();
    });

    it('waits for a pause in typing instead of searching on every key', async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'study');
      await screen.findByText(/no chats found/i);
      expect(vi.mocked(chatsApi.searchChats).mock.calls.map(([q]) => q)).toEqual(['study']);
    });

    it('finds people on the People tab and opens their profile', async () => {
      vi.mocked(usersApi.searchUsers).mockResolvedValue([
        makeUser({ id: 'u-9', username: 'bobby' }),
      ]);
      const user = userEvent.setup();
      renderSidebar();
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'bob');
      await user.click(await screen.findByRole('tab', { name: 'People' }));
      await user.click(await screen.findByRole('button', { name: /bobby/ }));
      expect(useChatUiStore.getState().profileUserId).toBe('u-9');
    });

    it('opens a public group from the results to preview it, and leaves the search', async () => {
      vi.mocked(chatsApi.searchChats).mockResolvedValue([
        makeChatSummary({ id: 'p', title: 'Public club', isPublic: true, isMember: false }),
      ]);
      const user = userEvent.setup();
      renderSidebar();
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'club');
      await user.click(await screen.findByRole('button', { name: /Public club/ }));
      expect(useChatUiStore.getState().activeChatId).toBe('p');
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    });
  });
});
