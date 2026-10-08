import type { MessageDto } from '@chat/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePendingStore } from '@/stores/pending-store';
import { makeChatDetails, makeMessage } from '@/test/factories';
import { FakeIntersectionObserver } from '@/test/fake-intersection-observer';
import { fakeSocket } from '@/test/fake-socket';
import { renderWithProviders } from '@/test/utils';

import * as api from './api';
import { MessageList } from './MessageList';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('./api');

const CHAT = 'chat-1';
const ME = 'user-1';
const fromBob = (seq: number) =>
  makeMessage({
    id: `m${seq}`,
    chatId: CHAT,
    seq,
    content: `bob ${seq}`,
    sender: { id: 'user-2', username: 'bob' },
  });
const fromMe = (seq: number) =>
  makeMessage({
    id: `m${seq}`,
    chatId: CHAT,
    seq,
    content: `me ${seq}`,
    sender: { id: ME, username: 'alice' },
  });
const newestFirst = (...messages: MessageDto[]) => messages.toSorted((a, b) => b.seq - a.seq);

type Options = { messages?: MessageDto[]; cursor?: number; nextBefore?: number | null };
async function show({ messages = [], cursor = 0, nextBefore = null }: Options = {}) {
  vi.mocked(api.getMessages).mockResolvedValue({ items: newestFirst(...messages), nextBefore });
  const chat = makeChatDetails({
    id: CHAT,
    members: [
      { userId: ME, username: 'alice', role: 'MEMBER', lastReadSeq: cursor },
      { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: 0 },
    ],
  });
  const view = renderWithProviders(<MessageList chat={chat} myId={ME} />);
  if (messages.length) await screen.findByText(messages[0]!.content!);
  return view;
}
const row = (container: HTMLElement, seq: number) =>
  container.querySelector<HTMLElement>(`[data-seq="${seq}"]`)!;
/** the order of messages and the separator in the DOM; the layout is reversed, so this is newest first */
const domOrder = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-seq], [role="separator"]')].map(
    (el) => el.getAttribute('data-seq') ?? 'separator',
  );
const readEvents = () => fakeSocket.sent('chat:read');

beforeEach(() => {
  vi.resetAllMocks();
  fakeSocket.reset();
  usePendingStore.getState().reset();
});

describe('the list', () => {
  it('shows a placeholder while loading', () => {
    vi.mocked(api.getMessages).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<MessageList chat={makeChatDetails({ id: CHAT })} myId={ME} />);
    expect(screen.getByLabelText('Loading messages')).toBeInTheDocument();
  });

  it('invites to say hello in an empty chat', async () => {
    await show();
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('lists messages newest first in the page; the reversed layout then shows them oldest first, anchored to the bottom', async () => {
    const { container } = await show({ messages: [fromBob(1), fromMe(2), fromBob(3)], cursor: 3 });
    expect(domOrder(container)).toEqual(['3', '2', '1']);
    expect(screen.getByRole('list').className).toContain('flex-col-reverse');
  });

  it('puts messages that are still being sent after the stored ones, and hides one the server already has', async () => {
    usePendingStore.getState().upsert({
      clientId: 'c-new',
      chatId: CHAT,
      content: 'sending now',
      files: [],
      status: 'sending',
      createdAt: new Date().toISOString(),
    });
    usePendingStore.getState().upsert({
      clientId: 'c-done',
      chatId: CHAT,
      content: 'already stored',
      files: [],
      status: 'sending',
      createdAt: new Date().toISOString(),
    });
    await show({ messages: [fromBob(1), { ...fromMe(2), clientId: 'c-done' }] });

    expect(screen.getByText('sending now')).toBeInTheDocument();
    expect(screen.queryByText('already stored')).not.toBeInTheDocument(); // it is shown as the stored message
    expect(screen.getAllByText('me 2')).toHaveLength(1);
  });
});

describe('the "New messages" separator', () => {
  it('goes right before the oldest message from somebody else that I have not read', async () => {
    const { container } = await show({
      messages: [fromBob(1), fromBob(2), fromBob(3), fromBob(4)],
      cursor: 1,
    });
    expect(screen.getByRole('separator', { name: 'New messages' })).toBeInTheDocument();
    expect(domOrder(container)).toEqual(['4', '3', '2', 'separator', '1']); // newest first, so "before" is after in the DOM
  });

  it('is not shown when everything is read, or when the only newer messages are my own', async () => {
    const read = await show({ messages: [fromBob(1), fromBob(2)], cursor: 2 });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    read.unmount();

    await show({ messages: [fromBob(1), fromMe(2), fromMe(3)], cursor: 1 });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('is scrolled to when the chat opens', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    await show({ messages: [fromBob(1), fromBob(2)], cursor: 1 });
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'center' }));
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('separator').parentElement);
  });

  it('stays where it was while I read (it describes what was unread when I opened the chat)', async () => {
    const { container, rerender } = await show({
      messages: [fromBob(1), fromBob(2), fromBob(3)],
      cursor: 1,
    });
    const chatNow = makeChatDetails({
      id: CHAT,
      members: [
        { userId: ME, username: 'alice', role: 'MEMBER', lastReadSeq: 3 },
        { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: 0 },
      ],
    });
    rerender(<MessageList chat={chatNow} myId={ME} />);
    expect(domOrder(container)).toEqual(['3', '2', 'separator', '1']);
  });
});

describe('marking messages as read', () => {
  const longEnough = () => new Promise((resolve) => setTimeout(resolve, 450)); // the 300 ms debounce, with margin

  it('tells the server the newest message I have actually seen, once, after a short pause', async () => {
    const { container } = await show({
      messages: [fromBob(1), fromBob(2), fromBob(3), fromBob(4)],
      cursor: 1,
    });
    act(() => FakeIntersectionObserver.show(row(container, 3), row(container, 4)));
    expect(readEvents()).toEqual([]); // debounced
    await waitFor(() => expect(readEvents()).toEqual([{ chatId: CHAT, seq: 4 }]));
  });

  it('does not repeat itself for what was already sent', async () => {
    const { container } = await show({ messages: [fromBob(1), fromBob(2), fromBob(3)], cursor: 0 });
    act(() => FakeIntersectionObserver.show(row(container, 3)));
    await waitFor(() => expect(readEvents()).toHaveLength(1));
    act(() => FakeIntersectionObserver.show(row(container, 2)));
    await longEnough();
    expect(readEvents()).toHaveLength(1);
  });

  it('ignores messages that are not newer than my read cursor', async () => {
    const { container } = await show({ messages: [fromBob(1), fromBob(2)], cursor: 2 });
    act(() => FakeIntersectionObserver.show(row(container, 1), row(container, 2)));
    await longEnough();
    expect(readEvents()).toEqual([]);
  });

  it('never watches my own messages: writing something is not reading', async () => {
    const { container } = await show({ messages: [fromBob(1), fromMe(2)], cursor: 0 });
    expect(FakeIntersectionObserver.watching(row(container, 2))).toHaveLength(0);
    expect(FakeIntersectionObserver.watching(row(container, 1)).length).toBeGreaterThan(0);
  });

  it('waits while the tab is in the background, and reports as soon as it is looked at again', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { container } = await show({ messages: [fromBob(1), fromBob(2)], cursor: 0 });
    act(() => FakeIntersectionObserver.show(row(container, 2)));
    await longEnough();
    expect(readEvents()).toEqual([]);

    visibility.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(readEvents()).toEqual([{ chatId: CHAT, seq: 2 }]));
    visibility.mockRestore();
  });

  it('forgets a message that scrolls out of view', async () => {
    const { container } = await show({ messages: [fromBob(1), fromBob(2)], cursor: 0 });
    act(() => FakeIntersectionObserver.show(row(container, 2)));
    act(() => FakeIntersectionObserver.hide(row(container, 2)));
    await longEnough();
    expect(readEvents()).toEqual([]);
  });
});

describe('older messages', () => {
  afterEach(() => vi.mocked(api.getMessages).mockReset());

  it('loads the next page when the top of the list comes into view', async () => {
    const { container } = await show({ messages: [fromBob(3), fromBob(4)], nextBefore: 3 });
    const top = container.querySelector<HTMLElement>('[data-sentinel]')!;
    vi.mocked(api.getMessages).mockResolvedValueOnce({
      items: [fromBob(2), fromBob(1)],
      nextBefore: null,
    });

    act(() => FakeIntersectionObserver.show(top));
    await waitFor(() => expect(screen.getByText('bob 1')).toBeInTheDocument());
    expect(vi.mocked(api.getMessages).mock.calls.at(-1)![1]).toBe(3);
  });

  it('has nothing more to load for a short chat', async () => {
    const { container } = await show({ messages: [fromBob(1)], nextBefore: null });
    expect(container.querySelector('[data-sentinel]')).toBeNull();
  });
});
