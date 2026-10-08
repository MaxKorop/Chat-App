import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '@/features/auth/api';
import * as chatsApi from '@/features/chats/api';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeMe } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { renderWithProviders } from '@/test/utils';

import { App } from './App';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('@/features/auth/api');
vi.mock('@/features/chats/api');
vi.mock('@/features/users/api');

beforeEach(() => {
  vi.resetAllMocks();
  fakeSocket.reset();
  useAuthStore.setState({ token: null });
  useChatUiStore.getState().reset();
  vi.mocked(chatsApi.getChats).mockResolvedValue([]);
});

describe('App', () => {
  it('shows the log-in screen to somebody without a session, and does not connect the socket', () => {
    renderWithProviders(<App />);
    expect(screen.getByRole('tab', { name: 'Log in' })).toBeInTheDocument();
    expect(authApi.getMe).not.toHaveBeenCalled();
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('shows a loading screen, not the log-in form, while a saved session is being checked', () => {
    useAuthStore.setState({ token: 'saved-token' });
    vi.mocked(authApi.getMe).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<App />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('opens the app for a valid saved session, and connects the socket', async () => {
    useAuthStore.setState({ token: 'saved-token' });
    vi.mocked(authApi.getMe).mockResolvedValue(makeMe());
    renderWithProviders(<App />);
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(fakeSocket.connect).toHaveBeenCalled();
  });

  it('when the server cannot be reached, says so and lets the user retry (the session is kept)', async () => {
    useAuthStore.setState({ token: 'saved-token' });
    vi.mocked(authApi.getMe).mockRejectedValueOnce(
      new Error('Cannot reach the server. Check your connection.'),
    );
    vi.mocked(authApi.getMe).mockResolvedValueOnce(makeMe());
    const user = userEvent.setup();
    renderWithProviders(<App />);

    expect(await screen.findByText(/could not load your account/i)).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBe('saved-token');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
  });

  it('goes back to the log-in screen on logout, and disconnects', async () => {
    useAuthStore.setState({ token: 'saved-token' });
    vi.mocked(authApi.getMe).mockResolvedValue(makeMe());
    renderWithProviders(<App />);
    await screen.findByRole('searchbox', { name: 'Search' });

    act(() => useAuthStore.getState().logout());
    expect(await screen.findByRole('tab', { name: 'Log in' })).toBeInTheDocument();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });
});
