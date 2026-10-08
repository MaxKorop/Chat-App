import type { MessagesPage } from '@chat/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatKeys } from '@/lib/query-keys';
import { makeMessage } from '@/test/factories';
import { createTestQueryClient } from '@/test/utils';

import { flattenMessages, removeMessage, replaceMessage, upsertMessage } from './cache';

type Pages = InfiniteData<MessagesPage, number | undefined>;
const CHAT = 'chat-1';
const m = (seq: number, content = `m${seq}`) =>
  makeMessage({ id: `id-${seq}`, chatId: CHAT, seq, content });
const seqs = (data: Pages | undefined) => flattenMessages(data).map((x) => x.seq);

let qc: ReturnType<typeof createTestQueryClient>;
const seed = (pages: MessagesPage[]) =>
  qc.setQueryData<Pages>(chatKeys.messages(CHAT), {
    pages,
    pageParams: pages.map(() => undefined),
  });
const read = () => qc.getQueryData<Pages>(chatKeys.messages(CHAT));

beforeEach(() => {
  qc = createTestQueryClient();
});

describe('upsertMessage', () => {
  it('puts a new message at the front (history is newest first), when it is the next in sequence', () => {
    seed([{ items: [m(2), m(1)], nextBefore: null }]);
    upsertMessage(qc, m(3));
    expect(seqs(read())).toEqual([3, 2, 1]);
  });

  it('puts it into the first page, not an older one', () => {
    seed([
      { items: [m(4), m(3)], nextBefore: 3 },
      { items: [m(2), m(1)], nextBefore: null },
    ]);
    upsertMessage(qc, m(5));
    expect(read()!.pages[0]!.items.map((x) => x.seq)).toEqual([5, 4, 3]);
    expect(read()!.pages[1]!.items.map((x) => x.seq)).toEqual([2, 1]);
  });

  it('does not duplicate a message it already has (the sender gets it as an ack AND as a broadcast)', () => {
    seed([{ items: [m(2), m(1)], nextBefore: null }]);
    upsertMessage(qc, m(2, 'same message again'));
    expect(seqs(read())).toEqual([2, 1]);
    expect(flattenMessages(read())[0]!.content).toBe('same message again'); // the newer copy wins
  });

  it('refetches instead of inserting when a number is missing (a gap means something was missed)', () => {
    seed([{ items: [m(2), m(1)], nextBefore: null }]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    upsertMessage(qc, m(5));
    expect(seqs(read())).toEqual([2, 1]); // untouched
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.messages(CHAT) });
  });

  it('accepts the first message of an empty chat, and leaves chats that were never opened alone', () => {
    seed([{ items: [], nextBefore: null }]);
    upsertMessage(qc, m(1));
    expect(seqs(read())).toEqual([1]);

    upsertMessage(qc, makeMessage({ chatId: 'never-opened', seq: 1 }));
    expect(qc.getQueryData(chatKeys.messages('never-opened'))).toBeUndefined();
  });
});

describe('replaceMessage', () => {
  it('replaces a message wherever it is, keeping the order', () => {
    seed([
      { items: [m(4), m(3)], nextBefore: 3 },
      { items: [m(2), m(1)], nextBefore: null },
    ]);
    replaceMessage(qc, { ...m(2), content: 'edited', editedAt: '2026-01-05T11:00:00.000Z' });
    expect(flattenMessages(read()).map((x) => x.content)).toEqual(['m4', 'm3', 'edited', 'm1']);
  });

  it('ignores a message it does not have', () => {
    seed([{ items: [m(1)], nextBefore: null }]);
    replaceMessage(qc, m(9));
    expect(seqs(read())).toEqual([1]);
  });
});

describe('removeMessage', () => {
  it('removes a message from whichever page holds it', () => {
    seed([
      { items: [m(4), m(3)], nextBefore: 3 },
      { items: [m(2), m(1)], nextBefore: null },
    ]);
    removeMessage(qc, CHAT, 'id-3');
    expect(seqs(read())).toEqual([4, 2, 1]);
  });

  it('is harmless for an unknown chat or message', () => {
    expect(() => removeMessage(qc, 'unknown', 'x')).not.toThrow();
    seed([{ items: [m(1)], nextBefore: null }]);
    removeMessage(qc, CHAT, 'nope');
    expect(seqs(read())).toEqual([1]);
  });
});

describe('flattenMessages', () => {
  it('lists all loaded pages in order, and handles nothing loaded', () => {
    expect(flattenMessages(undefined)).toEqual([]);
    seed([
      { items: [m(4), m(3)], nextBefore: 3 },
      { items: [m(2)], nextBefore: null },
    ]);
    expect(seqs(read())).toEqual([4, 3, 2]);
  });
});
