import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeChatDetails } from '@/test/factories';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { JoinChatBar } from './JoinChatBar';

vi.mock('./api');
beforeEach(() => vi.resetAllMocks());

describe('JoinChatBar', () => {
  it('invites to join, and joins when the button is pressed', async () => {
    vi.mocked(api.joinChat).mockResolvedValue(makeChatDetails({ id: 'g1', isMember: true }));
    const user = userEvent.setup();
    renderWithProviders(<JoinChatBar chatId="g1" />);
    expect(screen.getByText(/join to see the messages and write/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Join group' }));
    await waitFor(() => expect(api.joinChat).toHaveBeenCalled());
    expect(vi.mocked(api.joinChat).mock.calls[0]![0]).toBe('g1');
  });

  it('shows progress and cannot be pressed twice', async () => {
    vi.mocked(api.joinChat).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<JoinChatBar chatId="g1" />);
    await user.click(screen.getByRole('button', { name: 'Join group' }));
    expect(await screen.findByRole('button', { name: 'Joining…' })).toBeDisabled();
  });
});
