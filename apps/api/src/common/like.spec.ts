import { describe, expect, it } from 'vitest';

import { escapeLike } from './like';

describe('escapeLike', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLike('alice')).toBe('alice');
    expect(escapeLike('a.b*c')).toBe('a.b*c'); // regex characters mean nothing to LIKE
  });

  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });
});
