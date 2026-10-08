import type { ChatDetailsDto } from '@chat/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { markRead } from '@/lib/socket';
import { type PendingMessage, usePendingStore } from '@/stores/pending-store';

import { flattenMessages } from './cache';
import { MessageBubble } from './MessageBubble';
import { PendingBubble } from './PendingBubble';
import { useMessages } from './queries';

const NO_PENDING: PendingMessage[] = [];
const READ_AFTER_MS = 300;

/**
 * The history of a chat. The list is laid out in reverse (`flex-col-reverse`) with the newest
 * message first in the DOM: the browser then keeps the view at the bottom by itself, and older pages
 * can be added at the top without the view jumping.
 */
export function MessageList({ chat, myId }: { chat: ChatDetailsDto; myId: string }) {
  const {
    data,
    isPending,
    isError,
    isSuccess,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useMessages(chat.id);
  const stored = useMemo(() => flattenMessages(data), [data]);
  const pendingAll = usePendingStore((state) => state.byChat[chat.id]) ?? NO_PENDING;

  // a pending message the server already confirmed is shown as the stored one
  const storedClientIds = new Set(stored.map((m) => m.clientId));
  const pending = pendingAll.filter((m) => !storedClientIds.has(m.clientId)).toReversed();

  const myCursor = chat.members.find((m) => m.userId === myId)?.lastReadSeq ?? 0;
  const list = useRef<HTMLUListElement>(null);
  const separator = useRef<HTMLLIElement>(null);

  // "New messages" marks what was unread when the chat was opened; it does not move while reading.
  const [unreadFromSeq, setUnreadFromSeq] = useState<number | null | undefined>(undefined);
  const [openedWithCursor] = useState(myCursor);
  if (unreadFromSeq === undefined && isSuccess && !isFetching) {
    const unread = stored.filter((m) => m.seq > openedWithCursor && m.sender?.id !== myId);
    setUnreadFromSeq(unread.at(-1)?.seq ?? null); // the list is newest first, so the last one is the oldest
  }
  useEffect(() => {
    if (unreadFromSeq != null) separator.current?.scrollIntoView({ block: 'center' });
  }, [unreadFromSeq]);

  // sending something should bring the view back down
  useEffect(() => {
    if (pending.length > 0 && list.current) list.current.scrollTop = 0;
  }, [pending.length]);

  // ---- read tracking: report the newest message of somebody else that was really on screen ----
  const visible = useRef(new Set<number>());
  const sentSeq = useRef(0);
  const cursor = useRef(myCursor);
  const report = () => {
    if (document.visibilityState !== 'visible') return; // a message in a background tab is not read
    const seq = Math.max(0, ...visible.current);
    if (seq <= Math.max(sentSeq.current, cursor.current)) return;
    sentSeq.current = seq;
    markRead(chat.id, seq);
  };
  const reportSoon = useDebouncedCallback(report, READ_AFTER_MS);
  const latest = useRef({ report, reportSoon, hasNextPage, isFetchingNextPage, fetchNextPage });
  useEffect(() => {
    // the observer and the document listener are set up once, so they read the current values from here
    cursor.current = myCursor;
    latest.current = { report, reportSoon, hasNextPage, isFetchingNextPage, fetchNextPage };
  });

  useEffect(() => {
    const onVisibility = () => latest.current.report();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // One observer for both jobs: rows of other people (read tracking) and the top sentinel (older pages).
  const watched = stored
    .filter((m) => m.sender?.id !== myId)
    .map((m) => m.id)
    .join();
  useEffect(() => {
    const root = list.current;
    if (!root) return;
    visible.current.clear(); // a new observer reports the current state of everything it watches
    const observer = new IntersectionObserver(
      (entries) => {
        let seen = false;
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          if (target.hasAttribute('data-sentinel')) {
            const {
              hasNextPage: more,
              isFetchingNextPage: busy,
              fetchNextPage: next,
            } = latest.current;
            if (entry.isIntersecting && more && !busy) void next();
          } else if (entry.isIntersecting) {
            visible.current.add(Number(target.dataset.seq));
            seen = true;
          } else {
            visible.current.delete(Number(target.dataset.seq));
          }
        }
        if (seen) latest.current.reportSoon();
      },
      { root, rootMargin: '200px 0px' },
    );
    for (const element of root.querySelectorAll('[data-observe], [data-sentinel]'))
      observer.observe(element);
    return () => observer.disconnect();
    // `watched` and `hasNextPage` are not read inside: they say which rows exist, hence what to observe
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [watched, hasNextPage]);

  if (isPending) {
    return (
      <div aria-label="Loading messages" className="flex flex-1 flex-col justify-end gap-3 p-4">
        <Skeleton className="h-10 w-2/3 self-start rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        <Skeleton className="h-10 w-3/5 self-start rounded-2xl" />
      </div>
    );
  }
  if (isError && stored.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-muted-foreground">Could not load the messages.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (stored.length === 0 && pending.length === 0) {
    return (
      <p className="text-muted-foreground flex flex-1 items-center justify-center p-4">
        No messages yet. Say hello!
      </p>
    );
  }

  return (
    <ul ref={list} className="flex flex-1 flex-col-reverse gap-1.5 overflow-y-auto p-3">
      {pending.map((message) => (
        <li key={message.clientId} data-pending>
          <PendingBubble message={message} />
        </li>
      ))}
      {stored.map((message) => {
        const mine = message.sender?.id === myId;
        return [
          <li key={message.id} data-seq={message.seq} {...(mine ? {} : { 'data-observe': '' })}>
            <MessageBubble message={message} chat={chat} myId={myId} />
          </li>,
          message.seq === unreadFromSeq && (
            <li key="unread" ref={separator}>
              <div
                role="separator"
                aria-label="New messages"
                className="text-primary my-2 flex items-center gap-3 text-xs font-medium"
              >
                <span className="bg-primary/40 h-px flex-1" />
                New messages
                <span className="bg-primary/40 h-px flex-1" />
              </div>
            </li>
          ),
        ];
      })}
      {hasNextPage && (
        <li data-sentinel className="text-muted-foreground py-2 text-center text-xs">
          {isFetchingNextPage ? 'Loading older messages…' : ''}
        </li>
      )}
    </ul>
  );
}
