import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeMe, makeUser } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import * as api from './api';
import { SettingsDialog } from './SettingsDialog';

vi.mock('./api');

function open(me = makeMe({ username: 'alice', about: 'Loves TypeScript' })) {
  vi.mocked(api.getFriends).mockResolvedValue([]);
  useChatUiStore.getState().setDialog('settings');
  const view = renderWithProviders(<SettingsDialog />);
  loginAs(view.queryClient, me);
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
});

describe('SettingsDialog', () => {
  it('shows the current profile, with the e-mail that cannot be changed here', async () => {
    open();
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('alice');
    expect(screen.getByLabelText('About me')).toHaveValue('Loves TypeScript');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('keeps Save disabled until something is changed', async () => {
    const user = userEvent.setup();
    open();
    const save = await screen.findByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('About me'), '!');
    expect(save).toBeEnabled();
  });

  it('saves the profile and the privacy switches', async () => {
    vi.mocked(api.updateMe).mockResolvedValue(makeMe({ about: 'Hello', hideInSearch: true }));
    const user = userEvent.setup();
    const { queryClient } = open();

    await user.clear(await screen.findByLabelText('About me'));
    await user.type(screen.getByLabelText('About me'), 'Hello');
    await user.click(screen.getByRole('switch', { name: 'Hide me from search' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateMe).toHaveBeenCalled());
    expect(vi.mocked(api.updateMe).mock.calls[0]![0]).toMatchObject({
      about: 'Hello',
      hideInSearch: true,
      username: 'alice',
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(userKeys.me)).toMatchObject({ about: 'Hello' }),
    );
  });

  it('refuses an invalid username with the shared rule, without calling the server', async () => {
    const user = userEvent.setup();
    open();
    const field = await screen.findByLabelText('Username');
    await user.clear(field);
    await user.type(field, 'a b');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('lists friends with their status, and can remove one', async () => {
    vi.mocked(api.getFriends).mockResolvedValue([
      makeUser({ id: 'f1', username: 'bob', isOnline: true, isFriend: true }),
      makeUser({ id: 'f2', username: 'carol', isOnline: false, lastSeenAt: null, isFriend: true }),
    ]);
    vi.mocked(api.removeFriend).mockResolvedValue(undefined);
    const user = userEvent.setup();
    useChatUiStore.getState().setDialog('settings');
    const view = renderWithProviders(<SettingsDialog />);
    loginAs(view.queryClient);

    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('last seen recently')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove carol from friends' }));
    await waitFor(() => expect(api.removeFriend).toHaveBeenCalled());
    expect(vi.mocked(api.removeFriend).mock.calls[0]![0]).toBe('f2');
  });

  it('logs out: forgets the token and closes the dialog', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(useAuthStore.getState().token).toBeNull();
  });
});
