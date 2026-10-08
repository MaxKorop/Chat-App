import { beforeEach, describe, expect, it } from 'vitest';

import { type PendingMessage, usePendingStore } from './pending-store';

const pending = (overrides: Partial<PendingMessage> = {}): PendingMessage => ({
  clientId: 'c1',
  chatId: 'chat-1',
  content: 'hello',
  files: [],
  status: 'sending',
  createdAt: '2026-01-05T10:00:00.000Z',
  ...overrides,
});
const store = () => usePendingStore.getState();

beforeEach(() => store().reset());

describe('usePendingStore', () => {
  it('keeps unconfirmed messages per chat, oldest first', () => {
    store().upsert(pending({ clientId: 'a' }));
    store().upsert(pending({ clientId: 'b' }));
    store().upsert(pending({ clientId: 'c', chatId: 'chat-2' }));
    expect(store().byChat['chat-1']!.map((p) => p.clientId)).toEqual(['a', 'b']);
    expect(store().byChat['chat-2']!.map((p) => p.clientId)).toEqual(['c']);
  });

  it('upserting the same clientId replaces the message instead of adding another (a retry)', () => {
    store().upsert(pending({ status: 'failed', error: 'offline' }));
    store().upsert(pending({ status: 'sending' }));
    expect(store().byChat['chat-1']).toHaveLength(1);
    expect(store().byChat['chat-1']![0]).toMatchObject({ status: 'sending' });
  });

  it('patch changes only the given fields of one message', () => {
    store().upsert(pending({ clientId: 'a' }));
    store().upsert(pending({ clientId: 'b' }));
    store().patch('a', { status: 'failed', error: 'No connection' });
    expect(store().byChat['chat-1']![0]).toMatchObject({
      clientId: 'a',
      status: 'failed',
      error: 'No connection',
      content: 'hello',
    });
    expect(store().byChat['chat-1']![1]).toMatchObject({ clientId: 'b', status: 'sending' });
  });

  it('remove drops one message, and the chat entry when it was the last', () => {
    store().upsert(pending({ clientId: 'a' }));
    store().upsert(pending({ clientId: 'b' }));
    store().remove('a');
    expect(store().byChat['chat-1']!.map((p) => p.clientId)).toEqual(['b']);
    store().remove('b');
    expect(store().byChat).toEqual({});
  });

  it('ignores patch and remove for unknown messages', () => {
    store().upsert(pending());
    store().patch('nope', { status: 'failed' });
    store().remove('nope');
    expect(store().byChat['chat-1']).toHaveLength(1);
  });

  it('reset empties it', () => {
    store().upsert(pending());
    store().reset();
    expect(store().byChat).toEqual({});
  });
});
