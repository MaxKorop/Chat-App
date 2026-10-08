import { describe, expect, it } from 'vitest';

import { getInitials, truncate } from './text';

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('never returns more than `max` characters, ending with an ellipsis', () => {
    const result = truncate('hello world', 8);
    expect(result).toBe('hello w…');
    expect(result).toHaveLength(8);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(truncate('hello world', 7)).toBe('hello…');
  });
});

describe('getInitials', () => {
  it.each([
    ['alice', 'A'],
    ['John Doe', 'JD'],
    ['  mary   jane  watson ', 'MJ'],
    ['', '?'],
    ['   ', '?'],
  ])('%j → %j', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });
});
