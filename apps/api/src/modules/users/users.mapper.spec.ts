import { meSchema, publicUserSchema } from '@chat/shared';
import { describe, expect, it } from 'vitest';

import { toMe, toPublicUser } from './users.mapper';

const row = {
  id: '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b',
  username: 'alice',
  email: 'alice@example.com',
  passwordHash: '$2b$10$secret',
  about: 'hi',
  lastSeenAt: new Date('2026-01-05T10:00:00.000Z'),
  hideLastSeen: false,
  hideInSearch: false,
  allowFriendRequests: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('toPublicUser', () => {
  it('matches the shared DTO and never leaks private fields', () => {
    const dto = toPublicUser(row, { isOnline: false, isFriend: true });
    expect(publicUserSchema.parse(dto)).toEqual(dto);
    expect(dto).toMatchObject({
      username: 'alice',
      lastSeenAt: '2026-01-05T10:00:00.000Z',
      isFriend: true,
    });
    for (const secret of ['email', 'passwordHash', 'hideInSearch', 'hideLastSeen']) {
      expect(dto).not.toHaveProperty(secret);
    }
  });

  it('hides the last-seen time when the user asked for it', () => {
    expect(
      toPublicUser({ ...row, hideLastSeen: true }, { isOnline: false, isFriend: false }).lastSeenAt,
    ).toBeNull();
  });

  it('passes presence through as given', () => {
    expect(toPublicUser(row, { isOnline: true, isFriend: false }).isOnline).toBe(true);
  });
});

describe('toMe', () => {
  it('matches the shared DTO, includes the e-mail and settings, but never the password hash', () => {
    const dto = toMe(row);
    expect(meSchema.parse(dto)).toEqual(dto);
    expect(dto).toMatchObject({
      email: 'alice@example.com',
      hideLastSeen: false,
      hideInSearch: false,
    });
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('shows users their own last-seen time even when they hide it from others', () => {
    expect(toMe({ ...row, hideLastSeen: true }).lastSeenAt).toBe('2026-01-05T10:00:00.000Z');
  });
});
