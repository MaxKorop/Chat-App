import { describe, expect, it } from 'vitest';

import { parseKeyring } from './keyring';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');

describe('parseKeyring', () => {
  it('parses a single key', () => {
    const ring = parseKeyring(`1:${key(1)}`);
    expect([...ring.keys()]).toEqual([1]);
    expect(ring.get(1)).toEqual(Buffer.alloc(32, 1));
  });

  it('parses several keys, tolerating spaces', () => {
    const ring = parseKeyring(`1:${key(1)}, 2:${key(2)}`);
    expect([...ring.keys()]).toEqual([1, 2]);
    expect(ring.get(2)).toEqual(Buffer.alloc(32, 2));
  });

  it.each([
    ['an empty string', ''],
    ['a key without an id', key(1)],
    ['a non-numeric id', `abc:${key(1)}`],
    ['a key that is not 32 bytes', `1:${Buffer.alloc(16, 1).toString('base64')}`],
    ['a key that is not base64', '1:***'],
    ['a duplicated id', `1:${key(1)},1:${key(2)}`],
  ])('rejects %s with a helpful message', (_name, raw) => {
    expect(() => parseKeyring(raw)).toThrow(/MESSAGE_KEYS/);
  });
});
