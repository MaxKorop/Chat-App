import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatSummary } from '@/test/factories';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { ChatList } from './ChatList';

vi.mock('./api');

beforeEach(() => {
  vi.resetAllMocks();
  useChatUiStore.getState().reset();
});

describe('ChatList', () => {
  it('lists the user’s chats', async () => {
    vi.mocked(api.getChats).mockResolvedValue([
      makeChatSummary({ id: 'a', title: 'Study group' }),
      makeChatSummary({ id: 'b', title: 'bob', type: 'DIRECT' }),
    ]);
    renderWithProviders(<ChatList />);
    expect(await screen.findByText('Study group')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('shows placeholders while loading', () => {
    vi.mocked(api.getChats).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ChatList />);
    expect(screen.getByLabelText('Loading chats')).toBeInTheDocument();
  });

  it('tells a new user what to do', async () => {
    vi.mocked(api.getChats).mockResolvedValue([]);
    renderWithProviders(<ChatList />);
    expect(await screen.findByText(/no chats yet/i)).toBeInTheDocument();
  });

  it('opens a chat when it is clicked, and highlights the open one', async () => {
    vi.mocked(api.getChats).mockResolvedValue([
      makeChatSummary({ id: 'a', title: 'Study group' }),
      makeChatSummary({ id: 'b', title: 'Project X' }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<ChatList />);

    await user.click(await screen.findByRole('button', { name: /Project X/ }));
    expect(useChatUiStore.getState().activeChatId).toBe('b');
    expect(screen.getByRole('button', { name: /Project X/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Study group/ })).not.toHaveAttribute('aria-current');
  });
});
