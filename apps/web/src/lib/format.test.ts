import { describe, expect, it } from 'vitest';

import { formatListTime } from './format';

// local-time dates, so the test passes in every time zone
const at = (y: number, month: number, d: number, h = 12, min = 0) =>
  new Date(y, month - 1, d, h, min);
const now = at(2026, 1, 15, 18, 0);

describe('formatListTime (the time next to a chat in the list)', () => {
  it('shows the time of day for today', () => {
    expect(formatListTime(at(2026, 1, 15, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('says "Yesterday" for yesterday, even just after midnight', () => {
    expect(formatListTime(at(2026, 1, 14, 23, 59).toISOString(), now)).toBe('Yesterday');
    expect(formatListTime(at(2026, 1, 14, 0, 1).toISOString(), at(2026, 1, 15, 0, 5))).toBe(
      'Yesterday',
    );
  });

  it('shows day and month for earlier dates this year', () => {
    expect(formatListTime(at(2026, 1, 3).toISOString(), now)).toBe('03.01');
  });

  it('adds the year for dates in earlier years', () => {
    expect(formatListTime(at(2025, 12, 31).toISOString(), now)).toBe('31.12.25');
  });
});
