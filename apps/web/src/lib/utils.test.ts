import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins class names and ignores falsy values', () => {
    const hidden = Boolean(0);
    expect(cn('a', hidden && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later Tailwind class win over a conflicting earlier one', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('accepts conditional objects and arrays', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });
});
