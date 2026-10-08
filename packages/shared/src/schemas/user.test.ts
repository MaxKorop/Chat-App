import { describe, expect, it } from 'vitest';

import { meSchema, publicUserSchema, updateMeSchema } from './user';

const id = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

describe('publicUserSchema', () => {
  const user = {
    id,
    username: 'alice',
    about: '',
    isOnline: false,
    lastSeenAt: null,
    isFriend: true,
    allowFriendRequests: true,
  };

  it('accepts a user whose last-seen time is hidden (null)', () => {
    expect(publicUserSchema.safeParse(user).success).toBe(true);
  });

  it('accepts an ISO last-seen time and rejects other formats', () => {
    expect(
      publicUserSchema.safeParse({ ...user, lastSeenAt: '2026-01-05T10:00:00.000Z' }).success,
    ).toBe(true);
    expect(publicUserSchema.safeParse({ ...user, lastSeenAt: '05.01.2026' }).success).toBe(false);
  });
});

describe('meSchema', () => {
  it('requires the e-mail and the privacy flags, but not presence fields', () => {
    const me = {
      id,
      username: 'alice',
      about: '',
      lastSeenAt: null,
      allowFriendRequests: true,
      email: 'alice@example.com',
      hideLastSeen: false,
      hideInSearch: false,
    };
    expect(meSchema.safeParse(me).success).toBe(true);
    expect(meSchema.safeParse({ ...me, email: undefined }).success).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepts a partial update', () => {
    expect(updateMeSchema.parse({ about: 'hi' })).toEqual({ about: 'hi' });
    expect(updateMeSchema.parse({})).toEqual({});
  });

  it('still validates the fields that are present', () => {
    expect(updateMeSchema.safeParse({ about: 'x'.repeat(101) }).success).toBe(false);
    expect(updateMeSchema.safeParse({ username: 'a' }).success).toBe(false);
  });
});
