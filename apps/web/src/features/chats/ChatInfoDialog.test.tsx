import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { chatKeys } from '@/lib/query-keys';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails } from '@/test/factories';
import { loginAs, renderWithProviders } from '@/test/utils';

import { ChatInfoDialog } from './ChatInfoDialog';

const chat = makeChatDetails({
  id: 'g1',
  title: 'Study group',
  description: 'Exam prep for the databases course',
  createdAt: new Date(2026, 0, 1, 10, 0).toISOString(),
  members: [
    { userId: 'user-1', username: 'alice', role: 'OWNER', lastReadSeq: 0 },
    { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: 0 },
  ],
});

function open() {
  useChatUiStore.getState().openChat('g1');
  useChatUiStore.getState().setDialog('chatInfo');
  const view = renderWithProviders(<ChatInfoDialog />);
  loginAs(view.queryClient);
  view.queryClient.setQueryData(chatKeys.detail('g1'), chat);
  return view;
}

beforeEach(() => useChatUiStore.getState().reset());

describe('ChatInfoDialog', () => {
  it('shows the name, description, creation date and members, marking the owner', async () => {
    open();
    expect(await screen.findByRole('dialog', { name: 'Study group' })).toBeInTheDocument();
    expect(screen.getByText('Exam prep for the databases course')).toBeInTheDocument();
    expect(screen.getByText(/01\.01\.2026 10:00/)).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('opens the profile of a member that is clicked', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /bob/ }));
    expect(useChatUiStore.getState().profileUserId).toBe('user-2');
  });

  it('is closed unless asked for', () => {
    useChatUiStore.getState().openChat('g1');
    renderWithProviders(<ChatInfoDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
