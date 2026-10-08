import { LIMITS } from '@chat/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatUiStore } from '@/stores/chat-ui-store';
import { makeMessage } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { MessageComposer } from './MessageComposer';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn<(message: string) => void>() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('./api');

const CHAT = 'chat-1';
const png = (name = 'cat.png', size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });
const box = () => screen.getByRole('textbox', { name: 'Message' });
const sentMessages = () => fakeSocket.sent('message:send') as Record<string, unknown>[];
const typingEvents = () => fakeSocket.sent('typing');

beforeEach(() => {
  vi.resetAllMocks();
  fakeSocket.reset();
  fakeSocket.ackResponder = () => ({ ok: true, data: makeMessage({ chatId: CHAT }) });
  useChatUiStore.getState().reset();
});

const setup = () => ({
  user: userEvent.setup(),
  ...renderWithProviders(<MessageComposer chatId={CHAT} />),
});

describe('sending text', () => {
  it('Enter sends the message and clears the box', async () => {
    const { user } = setup();
    await user.type(box(), 'hello{Enter}');
    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0]).toMatchObject({ chatId: CHAT, content: 'hello' });
    expect(box()).toHaveValue('');
  });

  it('the send button does the same, and is disabled until there is something to send', async () => {
    const { user } = setup();
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    await user.type(box(), 'hi');
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => expect(sentMessages()).toHaveLength(1));
  });

  it('Shift+Enter starts a new line instead of sending', async () => {
    const { user } = setup();
    await user.type(box(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(sentMessages()).toEqual([]);
    expect(box()).toHaveValue('line one\nline two');
  });

  it('never sends an empty or whitespace-only message', async () => {
    const { user } = setup();
    await user.type(box(), '   {Enter}');
    expect(sentMessages()).toEqual([]);
  });

  it('trims the text it sends', async () => {
    const { user } = setup();
    await user.type(box(), '  padded  {Enter}');
    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0]).toMatchObject({ content: 'padded' });
  });
});

describe('replying', () => {
  const original = makeMessage({
    id: 'm-bob',
    chatId: CHAT,
    sender: { id: 'user-2', username: 'bob' },
    content: 'Are you coming?',
  });

  it('shows who and what is being replied to, and can be cancelled', async () => {
    const { user } = setup();
    act(() => useChatUiStore.getState().setReplyTo(original));
    expect(await screen.findByText('Replying to bob')).toBeInTheDocument();
    expect(screen.getByText('Are you coming?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to bob')).not.toBeInTheDocument();
    expect(useChatUiStore.getState().replyTo).toBeNull();
  });

  it('sends the reply with the message, then forgets it', async () => {
    const { user } = setup();
    act(() => useChatUiStore.getState().setReplyTo(original));
    await user.type(box(), 'Yes!{Enter}');
    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0]).toMatchObject({ content: 'Yes!', replyToId: 'm-bob' });
    expect(useChatUiStore.getState().replyTo).toBeNull();
  });
});

describe('images', () => {
  // the file dialog filters by `accept`, but a drag-and-drop or a renamed file does not, so the check must not rely on it
  const choose = (files: File[]) =>
    userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('Choose images'), files);

  it('shows a thumbnail per chosen image, which can be removed again', async () => {
    const { user } = setup();
    await choose([png('a.png'), png('b.png')]);
    expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove b.png' }));
    expect(screen.queryByRole('img', { name: 'b.png' })).not.toBeInTheDocument();
  });

  it('an image alone can be sent: it is uploaded first, then referenced by id', async () => {
    vi.mocked(api.uploadAttachments).mockResolvedValue([
      { id: 'att-1', fileName: 'cat.png', mimeType: 'image/png', size: 10, url: 'http://s3/x' },
    ]);
    const { user } = setup();
    await choose([png()]);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(api.uploadAttachments).toHaveBeenCalledTimes(1);
    expect(sentMessages()[0]).toMatchObject({ attachmentIds: ['att-1'] });
    expect(screen.queryByRole('img', { name: 'cat.png' })).not.toBeInTheDocument(); // cleared after sending
  });

  it.each([
    [
      'a file that is not an image',
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      /only png, jpeg, gif and webp/i,
    ],
    [
      'an image over the size limit',
      png('huge.png', LIMITS.ATTACHMENT_MAX_BYTES + 1),
      /larger than 5 MB/i,
    ],
  ])('refuses %s with a message, and does not add it', async (_name, file, message) => {
    setup();
    await choose([file]);
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(message));
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('refuses more images than a message can carry', async () => {
    setup();
    await choose(
      Array.from({ length: LIMITS.ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => png(`p${i}.png`)),
    );
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/at most 10/i));
    expect(screen.getAllByRole('button', { name: /Remove/ })).toHaveLength(
      LIMITS.ATTACHMENTS_PER_MESSAGE,
    );
  });
});

describe('typing indicator', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('tells the others when typing starts, then at most every 3 seconds', async () => {
    const { user } = setup();
    await user.type(box(), 'ab');
    expect(typingEvents()).toEqual([{ chatId: CHAT, isTyping: true }]); // not one per key

    act(() => void vi.advanceTimersByTime(3_100));
    await user.type(box(), 'c');
    expect(typingEvents()).toHaveLength(2);
  });

  it('says typing stopped when the box is emptied, and when the message is sent', async () => {
    const { user } = setup();
    await user.type(box(), 'a');
    await user.clear(box());
    expect(typingEvents().at(-1)).toEqual({ chatId: CHAT, isTyping: false });

    await user.type(box(), 'b{Enter}');
    await vi.waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(typingEvents().at(-1)).toEqual({ chatId: CHAT, isTyping: false });
  });

  it('says typing stopped when the user leaves the chat', async () => {
    const { user, unmount } = setup();
    await user.type(box(), 'a');
    unmount();
    expect(typingEvents().at(-1)).toEqual({ chatId: CHAT, isTyping: false });
  });
});
