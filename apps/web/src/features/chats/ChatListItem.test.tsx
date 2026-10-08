import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypingStore } from '@/stores/typing-store';
import { makeChatSummary } from '@/test/factories';

import { ChatListItem } from './ChatListItem';

beforeEach(() => useTypingStore.getState().reset());

const show = (
  chat = makeChatSummary(),
  props: { active?: boolean; onSelect?: (id: string) => void } = {},
) =>
  render(
    <ChatListItem
      chat={chat}
      active={props.active ?? false}
      onSelect={props.onSelect ?? vi.fn<(id: string) => void>()}
    />,
  );

describe('ChatListItem', () => {
  it('shows the name, the initials and the last message', () => {
    show(
      makeChatSummary({
        title: 'Study group',
        lastMessage: { preview: 'See you at 6', createdAt: new Date().toISOString() },
      }),
    );
    expect(screen.getByText('Study group')).toBeInTheDocument();
    expect(screen.getByText('SG')).toBeInTheDocument();
    expect(screen.getByText('See you at 6')).toBeInTheDocument();
  });

  it('says so when nobody has written anything yet', () => {
    show(makeChatSummary({ lastMessage: null }));
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('shows the number of unread messages, "99+" when there are many, and nothing when there are none', () => {
    const { rerender } = show(makeChatSummary({ unreadCount: 3 }));
    expect(screen.getByLabelText('3 unread messages')).toHaveTextContent('3');

    rerender(
      <ChatListItem
        chat={makeChatSummary({ unreadCount: 250 })}
        active={false}
        onSelect={vi.fn<(id: string) => void>()}
      />,
    );
    expect(screen.getByLabelText('250 unread messages')).toHaveTextContent('99+');

    rerender(
      <ChatListItem
        chat={makeChatSummary({ unreadCount: 0 })}
        active={false}
        onSelect={vi.fn<(id: string) => void>()}
      />,
    );
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it('shows who is typing instead of the last message', () => {
    show(
      makeChatSummary({
        id: 'chat-1',
        lastMessage: { preview: 'old news', createdAt: new Date().toISOString() },
      }),
    );
    act(() => useTypingStore.getState().set('chat-1', 'user-2', 'bob', true));
    expect(screen.getByText('bob is typing…')).toBeInTheDocument();
    expect(screen.queryByText('old news')).not.toBeInTheDocument();
  });

  it('marks public groups', () => {
    show(makeChatSummary({ type: 'GROUP', isPublic: true }));
    expect(screen.getByLabelText('Public group')).toBeInTheDocument();
  });

  it('is marked as the current item when active', () => {
    const { rerender } = show(makeChatSummary(), { active: true });
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
    rerender(
      <ChatListItem
        chat={makeChatSummary()}
        active={false}
        onSelect={vi.fn<(id: string) => void>()}
      />,
    );
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-current');
  });

  it('selects the chat on click and on Enter', async () => {
    const onSelect = vi.fn<(id: string) => void>();
    const user = userEvent.setup();
    show(makeChatSummary({ id: 'chat-7' }), { onSelect });
    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter}');
    expect(onSelect.mock.calls).toEqual([['chat-7'], ['chat-7']]);
  });
});
