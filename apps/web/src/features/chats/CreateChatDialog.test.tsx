import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as usersApi from '@/features/users/api';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails, makeUser } from '@/test/factories';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { CreateChatDialog } from './CreateChatDialog';

vi.mock('./api');
vi.mock('@/features/users/api');

const alice = makeUser({
  id: '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b',
  username: 'alice',
  isFriend: true,
});
const bob = makeUser({
  id: '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a',
  username: 'bob',
  isFriend: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(usersApi.getFriends).mockResolvedValue([alice, bob]);
  useChatUiStore.getState().reset();
  useChatUiStore.getState().setDialog('createChat');
});

describe('CreateChatDialog', () => {
  it('is closed until the store asks for it', () => {
    useChatUiStore.getState().setDialog(null);
    renderWithProviders(<CreateChatDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('direct chat', () => {
    it('starts a direct chat with the friend that is clicked, opens it and closes the dialog', async () => {
      vi.mocked(api.createChat).mockResolvedValue(makeChatDetails({ id: 'dm-1', type: 'DIRECT' }));
      const user = userEvent.setup();
      renderWithProviders(<CreateChatDialog />);

      await user.click(await screen.findByRole('button', { name: /bob/ }));

      await waitFor(() => expect(useChatUiStore.getState().activeChatId).toBe('dm-1'));
      expect(vi.mocked(api.createChat).mock.calls[0]![0]).toEqual({
        type: 'DIRECT',
        userId: bob.id,
      });
      expect(useChatUiStore.getState().dialog).toBeNull();
    });

    it('explains how to get friends when there are none', async () => {
      vi.mocked(usersApi.getFriends).mockResolvedValue([]);
      renderWithProviders(<CreateChatDialog />);
      expect(await screen.findByText(/no friends yet/i)).toBeInTheDocument();
    });
  });

  describe('group chat', () => {
    async function openGroupTab() {
      const user = userEvent.setup();
      renderWithProviders(<CreateChatDialog />);
      await user.click(await screen.findByRole('tab', { name: 'Group' }));
      return user;
    }

    it('creates a group from the name, description, visibility and chosen friends', async () => {
      vi.mocked(api.createChat).mockResolvedValue(makeChatDetails({ id: 'group-1' }));
      const user = await openGroupTab();

      await user.type(screen.getByLabelText('Name'), '  Study group ');
      await user.type(screen.getByLabelText('Description'), 'exam prep');
      await user.click(screen.getByRole('switch', { name: 'Public' }));
      await user.click(await screen.findByRole('checkbox', { name: 'alice' }));
      await user.click(screen.getByRole('checkbox', { name: 'bob' }));
      await user.click(screen.getByRole('button', { name: 'Create group' }));

      await waitFor(() => expect(useChatUiStore.getState().activeChatId).toBe('group-1'));
      expect(vi.mocked(api.createChat).mock.calls[0]![0]).toEqual({
        type: 'GROUP',
        name: 'Study group',
        description: 'exam prep',
        isPublic: true,
        memberIds: [alice.id, bob.id],
      });
      expect(useChatUiStore.getState().dialog).toBeNull();
    });

    it('lets a friend be unticked again', async () => {
      vi.mocked(api.createChat).mockResolvedValue(makeChatDetails({ id: 'g' }));
      const user = await openGroupTab();
      await user.type(screen.getByLabelText('Name'), 'Study group');
      await user.click(await screen.findByRole('checkbox', { name: 'alice' }));
      await user.click(screen.getByRole('checkbox', { name: 'alice' }));
      await user.click(screen.getByRole('button', { name: 'Create group' }));
      await waitFor(() => expect(api.createChat).toHaveBeenCalled());
      expect(vi.mocked(api.createChat).mock.calls[0]![0]).toMatchObject({ memberIds: [] });
    });

    it('rejects a name that is too short, with the shared rule, and does not call the server', async () => {
      const user = await openGroupTab();
      await user.type(screen.getByLabelText('Name'), 'ab');
      await user.click(screen.getByRole('button', { name: 'Create group' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
      expect(api.createChat).not.toHaveBeenCalled();
      expect(useChatUiStore.getState().dialog).toBe('createChat'); // stays open
    });

    it('starts empty every time it is opened', async () => {
      const user = await openGroupTab();
      await user.type(screen.getByLabelText('Name'), 'Draft');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      useChatUiStore.getState().setDialog('createChat');
      await user.click(await screen.findByRole('tab', { name: 'Group' }));
      expect(screen.getByLabelText('Name')).toHaveValue('');
    });
  });
});
