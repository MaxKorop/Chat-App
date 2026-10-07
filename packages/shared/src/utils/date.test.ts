import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDateTime, formatLastSeen, formatTime } from './date';

describe('formatTime / formatDateTime', () => {
  // built from local time parts so the test passes in every time zone
  const iso = new Date(2026, 0, 5, 14, 30).toISOString();

  it('formats the time of day as HH:mm', () => {
    expect(formatTime(iso)).toBe('14:30');
  });

  it('formats a full date and time as dd.MM.yyyy HH:mm', () => {
    expect(formatDateTime(iso)).toBe('05.01.2026 14:30');
  });
});

describe('formatLastSeen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('says "online" for online users, whatever the timestamp', () => {
    expect(formatLastSeen({ isOnline: true, lastSeenAt: null })).toBe('online');
  });

  it('is vague when the user hides their last-seen time', () => {
    expect(formatLastSeen({ isOnline: false, lastSeenAt: null })).toBe('last seen recently');
  });

  it('is relative otherwise', () => {
    const fiveMinutesAgo = '2026-01-05T11:55:00.000Z';
    expect(formatLastSeen({ isOnline: false, lastSeenAt: fiveMinutesAgo })).toBe(
      'last seen 5 minutes ago',
    );
  });
});
