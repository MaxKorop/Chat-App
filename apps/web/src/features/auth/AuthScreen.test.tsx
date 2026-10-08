import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { makeMe } from '@/test/factories';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { AuthScreen } from './AuthScreen';

vi.mock('./api');

const session = { accessToken: 'jwt-1', user: makeMe() };
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ token: null });
});

describe('log in', () => {
  it('is the first thing shown, with username and password', () => {
    renderWithProviders(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Log in', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('logs in with the entered credentials, which stores the token and the user', async () => {
    vi.mocked(api.logIn).mockResolvedValue(session);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<AuthScreen />);

    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(useAuthStore.getState().token).toBe('jwt-1'));
    expect(vi.mocked(api.logIn).mock.calls[0]![0]).toEqual({
      username: 'alice',
      password: 'password123',
    });
    expect(queryClient.getQueryData(userKeys.me)).toEqual(session.user);
  });

  it('can be submitted with Enter', async () => {
    vi.mocked(api.logIn).mockResolvedValue(session);
    const user = userEvent.setup();
    renderWithProviders(<AuthScreen />);
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123{Enter}');
    await waitFor(() => expect(api.logIn).toHaveBeenCalledTimes(1));
  });

  it('does not call the server for an empty form, and explains what is missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthScreen />);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(api.logIn).not.toHaveBeenCalled();
  });

  it('stays on the form and can be tried again when the server refuses, and shows progress meanwhile', async () => {
    let refuse!: (error: Error) => void;
    vi.mocked(api.logIn).mockReturnValue(new Promise((_, reject) => (refuse = reject)));
    const user = userEvent.setup();
    renderWithProviders(<AuthScreen />);
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('button', { name: /logging in/i })).toBeDisabled();
    refuse(new Error('Invalid username or password'));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('sign up', () => {
  async function openSignUp() {
    const user = userEvent.setup();
    renderWithProviders(<AuthScreen />);
    await user.click(screen.getByRole('tab', { name: 'Sign up' }));
    return user;
  }

  it('asks for e-mail, username and password', async () => {
    await openSignUp();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('creates the account with the shared rules, then logs in', async () => {
    vi.mocked(api.signUp).mockResolvedValue(session);
    const user = await openSignUp();
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(useAuthStore.getState().token).toBe('jwt-1'));
    expect(vi.mocked(api.signUp).mock.calls[0]![0]).toEqual({
      email: 'alice@example.com',
      username: 'alice',
      password: 'password123',
    });
  });

  it.each([
    ['an invalid e-mail', 'Email', 'not-an-email'],
    ['a username with spaces', 'Username', 'a b'],
    ['a password shorter than 8 characters', 'Password', '1234567'],
  ])('rejects %s before asking the server', async (_name, field, value) => {
    const user = await openSignUp();
    await user.type(
      screen.getByLabelText('Email'),
      field === 'Email' ? value : 'alice@example.com',
    );
    await user.type(screen.getByLabelText('Username'), field === 'Username' ? value : 'alice');
    await user.type(
      screen.getByLabelText('Password'),
      field === 'Password' ? value : 'password123',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(api.signUp).not.toHaveBeenCalled();
  });
});
