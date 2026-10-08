import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TYPING_EXPIRES_MS, useTypingStore } from './typing-store';

const store = () => useTypingStore.getState();
const names = (chatId: string) => store().namesIn(chatId);

beforeEach(() => {
  vi.useFakeTimers();
  store().reset();
});
afterEach(() => vi.useRealTimers());

describe('useTypingStore', () => {
  it('shows who is typing in a chat', () => {
    store().set('chat-1', 'u1', 'alice', true);
    store().set('chat-1', 'u2', 'bob', true);
    store().set('chat-2', 'u3', 'carol', true);
    expect(names('chat-1').toSorted()).toEqual(['alice', 'bob']);
    expect(names('chat-2')).toEqual(['carol']);
    expect(names('chat-3')).toEqual([]);
  });

  it('stops showing someone as soon as they stop typing', () => {
    store().set('chat-1', 'u1', 'alice', true);
    store().set('chat-1', 'u1', 'alice', false);
    expect(names('chat-1')).toEqual([]);
  });

  it('forgets someone who went quiet without a "stopped" event (closed the tab), after 5 seconds', () => {
    store().set('chat-1', 'u1', 'alice', true);
    vi.advanceTimersByTime(TYPING_EXPIRES_MS - 1);
    expect(names('chat-1')).toEqual(['alice']);
    vi.advanceTimersByTime(1);
    expect(names('chat-1')).toEqual([]);
  });

  it('every new "typing" event restarts the 5 seconds', () => {
    store().set('chat-1', 'u1', 'alice', true);
    vi.advanceTimersByTime(3_000);
    store().set('chat-1', 'u1', 'alice', true);
    vi.advanceTimersByTime(3_000);
    expect(names('chat-1')).toEqual(['alice']); // 6 s since the first event, 3 s since the last
    vi.advanceTimersByTime(2_000);
    expect(names('chat-1')).toEqual([]);
  });

  it('expiry of one person does not touch another', () => {
    store().set('chat-1', 'u1', 'alice', true);
    vi.advanceTimersByTime(3_000);
    store().set('chat-1', 'u2', 'bob', true);
    vi.advanceTimersByTime(2_500);
    expect(names('chat-1')).toEqual(['bob']);
  });

  it('reset clears everyone and cancels the timers', () => {
    store().set('chat-1', 'u1', 'alice', true);
    store().reset();
    expect(names('chat-1')).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
