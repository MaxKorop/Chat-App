import type { ChatDetailsDto, MessageDto } from '@chat/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeChatDetails, makeMessage } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { renderWithProviders } from '@/test/utils';

import { MessageBubble } from './MessageBubble';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);

const ME = 'user-1';
const at = new Date(2026, 0, 5, 14, 30).toISOString();
const members = (lastReadByBob = 0): ChatDetailsDto['members'] => [
  { userId: ME, username: 'alice', role: 'OWNER', lastReadSeq: 0 },
  { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: lastReadByBob },
  { userId: 'user-3', username: 'carol', role: 'MEMBER', lastReadSeq: 0 },
];
const groupChat = (myRole: 'OWNER' | 'MEMBER' = 'OWNER', bobRead = 0) =>
  makeChatDetails({
    type: 'GROUP',
    members: members(bobRead).map((m) => (m.userId === ME ? { ...m, role: myRole } : m)),
  });
const dmChat = makeChatDetails({ type: 'DIRECT', members: members().slice(0, 2) });
const mine = (patch: Partial<MessageDto> = {}) =>
  makeMessage({
    id: 'm-mine',
    seq: 3,
    sender: { id: ME, username: 'alice' },
    createdAt: at,
    ...patch,
  });
const theirs = (patch: Partial<MessageDto> = {}) =>
  makeMessage({
    id: 'm-bob',
    seq: 4,
    sender: { id: 'user-2', username: 'bob' },
    createdAt: at,
    content: 'from bob',
    ...patch,
  });

const show = (message: MessageDto, chat = groupChat()) =>
  renderWithProviders(<MessageBubble message={message} chat={chat} myId={ME} />);
const rightClick = async (user: ReturnType<typeof userEvent.setup>, text: string) =>
  user.pointer({ keys: '[MouseRight]', target: screen.getByText(text) });

beforeEach(() => {
  fakeSocket.reset();
  useChatUiStore.getState().reset();
});

describe('what a message shows', () => {
  it('the text and the time of day', () => {
    show(mine({ content: 'hello there' }));
    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.getByText('14:30')).toBeInTheDocument();
  });

  it('displays text as text: markup in a message is never interpreted', () => {
    const { container } = show(mine({ content: '<img src=x onerror=alert(1)><b>bold</b>' }));
    expect(screen.getByText('<img src=x onerror=alert(1)><b>bold</b>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('names the sender of other people’s messages in a group, but not in a direct chat or for my own', () => {
    const { unmount } = show(theirs(), groupChat());
    expect(screen.getByText('bob')).toBeInTheDocument();
    unmount();

    const own = show(mine(), groupChat());
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    own.unmount();

    show(theirs(), dmChat);
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('calls a deleted account “Deleted user”', () => {
    show(theirs({ sender: null }));
    expect(screen.getByText('Deleted user')).toBeInTheDocument();
  });

  it('marks edited messages', () => {
    show(mine({ editedAt: at }));
    expect(screen.getByText('edited')).toBeInTheDocument();
  });

  it('shows images, and shows one bigger when clicked', async () => {
    const user = userEvent.setup();
    show(
      mine({
        content: null,
        attachments: [
          {
            id: 'a1',
            fileName: 'cat.png',
            mimeType: 'image/png',
            size: 10,
            url: 'http://s3/cat.png',
          },
        ],
      }),
    );
    const image = screen.getByRole('img', { name: 'cat.png' });
    expect(image).toHaveAttribute('src', 'http://s3/cat.png');

    await user.click(screen.getByRole('button', { name: 'Open cat.png' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'cat.png' })).toBeInTheDocument();
  });

  it('quotes the message it replies to, and jumps to it when the quote is clicked', async () => {
    const target = document.createElement('div');
    target.id = 'message-original';
    target.scrollIntoView = vi.fn<() => void>();
    document.body.append(target);
    const user = userEvent.setup();

    show(mine({ replyTo: { id: 'original', senderUsername: 'bob', preview: 'Are you coming?' } }));
    await user.click(screen.getByRole('button', { name: /Reply to bob: Are you coming\?/ }));
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    target.remove();
  });
});

describe('delivery and read ticks (own messages only)', () => {
  it('one tick while nobody has read it, two once somebody has', () => {
    const { unmount } = show(mine({ seq: 3 }), groupChat('OWNER', 2));
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();
    unmount();

    show(mine({ seq: 3 }), groupChat('OWNER', 3));
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('in a group, says how many of the others have read it', async () => {
    const user = userEvent.setup();
    show(mine({ seq: 3 }), groupChat('OWNER', 5));
    await user.hover(screen.getByLabelText('Read'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Read by 1 of 2');
  });

  it('other people’s messages have no ticks', () => {
    show(theirs());
    expect(screen.queryByLabelText('Sent')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument();
  });
});

describe('the context menu offers only what is allowed', () => {
  const itemsAfterRightClick = async (message: MessageDto, chat: ChatDetailsDto, text: string) => {
    const user = userEvent.setup();
    show(message, chat);
    await rightClick(user, text);
    return (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
  };

  it('my own message: reply, edit and delete', async () => {
    expect(
      await itemsAfterRightClick(mine({ content: 'mine' }), groupChat('MEMBER'), 'mine'),
    ).toEqual(['Reply', 'Edit', 'Delete']);
  });

  it('somebody else’s message in a group: only reply, for a plain member', async () => {
    expect(await itemsAfterRightClick(theirs(), groupChat('MEMBER'), 'from bob')).toEqual([
      'Reply',
    ]);
  });

  it('…and reply plus delete for the group’s owner (never edit)', async () => {
    expect(await itemsAfterRightClick(theirs(), groupChat('OWNER'), 'from bob')).toEqual([
      'Reply',
      'Delete',
    ]);
  });

  it('in a direct chat either person may delete any message', async () => {
    expect(await itemsAfterRightClick(theirs(), dmChat, 'from bob')).toEqual(['Reply', 'Delete']);
  });
});

describe('actions', () => {
  it('Reply puts the message into the composer’s reply bar', async () => {
    const user = userEvent.setup();
    const message = theirs();
    show(message);
    await rightClick(user, 'from bob');
    await user.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    expect(useChatUiStore.getState().replyTo).toEqual(message);
  });

  it('Delete asks first, and deletes only after confirmation', async () => {
    const user = userEvent.setup();
    show(mine({ content: 'oops' }));
    await rightClick(user, 'oops');
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this message?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fakeSocket.sent('message:delete')).toEqual([]);

    await rightClick(user, 'oops');
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() =>
      expect(fakeSocket.sent('message:delete')).toEqual([{ messageId: 'm-mine' }]),
    );
  });

  describe('editing', () => {
    async function startEditing(content = 'typo') {
      const user = userEvent.setup();
      show(mine({ content }));
      await rightClick(user, content);
      await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
      return { user, box: await screen.findByRole('textbox', { name: 'Edit message' }) };
    }

    it('turns the text into an input with the current text, and Enter saves it', async () => {
      const { user, box } = await startEditing();
      expect(box).toHaveValue('typo');
      await user.clear(box);
      await user.type(box, 'fixed{Enter}');
      await waitFor(() =>
        expect(fakeSocket.sent('message:edit')).toEqual([
          { messageId: 'm-mine', content: 'fixed' },
        ]),
      );
      expect(useChatUiStore.getState().editingMessageId).toBeNull();
    });

    it('puts the cursor in the input (the menu must not take the focus back when it closes)', async () => {
      const { box } = await startEditing();
      await new Promise((resolve) => setTimeout(resolve, 50)); // the menu returns focus asynchronously
      expect(box).toHaveFocus();
    });

    it('Escape cancels without sending anything', async () => {
      const { user, box } = await startEditing();
      await user.type(box, ' more{Escape}');
      expect(fakeSocket.sent('message:edit')).toEqual([]);
      expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
    });

    it('does not send an unchanged or an empty text', async () => {
      const { user, box } = await startEditing();
      await user.type(box, '{Enter}'); // unchanged
      expect(fakeSocket.sent('message:edit')).toEqual([]);

      const again = await startEditing('other');
      await again.user.clear(again.box);
      await again.user.type(again.box, '{Enter}');
      expect(fakeSocket.sent('message:edit')).toEqual([]);
    });

    it('Shift+Enter makes a new line instead of saving', async () => {
      const { user, box } = await startEditing();
      await user.type(box, '{Shift>}{Enter}{/Shift}');
      expect(fakeSocket.sent('message:edit')).toEqual([]);
      expect((box as HTMLTextAreaElement).value).toContain('\n');
    });
  });
});
