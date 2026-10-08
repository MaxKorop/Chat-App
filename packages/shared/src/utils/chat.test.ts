import { describe, expect, it } from 'vitest';

import { canDeleteMessage, canEditMessage, directKey, isReadBy } from './chat';

describe('directKey', () => {
  it('is the same no matter who starts the chat', () => {
    expect(directKey('b', 'a')).toBe(directKey('a', 'b'));
    expect(directKey('a', 'b')).toBe('a:b');
  });
});

describe('canEditMessage', () => {
  it('is only allowed for the author', () => {
    expect(canEditMessage('me', 'me')).toBe(true);
    expect(canEditMessage('me', 'someone')).toBe(false);
    expect(canEditMessage('me', null)).toBe(false); // sender account was deleted
  });
});

describe('canDeleteMessage', () => {
  const base = { myId: 'me', senderId: 'someone' } as const;

  it('lets the author delete their own message anywhere', () => {
    expect(canDeleteMessage({ ...base, senderId: 'me', chatType: 'GROUP', myRole: 'MEMBER' })).toBe(
      true,
    );
  });

  it('lets any participant of a DIRECT chat delete', () => {
    expect(canDeleteMessage({ ...base, chatType: 'DIRECT', myRole: 'MEMBER' })).toBe(true);
  });

  it('lets only the owner delete other people’s messages in a GROUP', () => {
    expect(canDeleteMessage({ ...base, chatType: 'GROUP', myRole: 'OWNER' })).toBe(true);
    expect(canDeleteMessage({ ...base, chatType: 'GROUP', myRole: 'MEMBER' })).toBe(false);
  });

  it('treats a message with no sender like someone else’s', () => {
    expect(canDeleteMessage({ ...base, senderId: null, chatType: 'GROUP', myRole: 'MEMBER' })).toBe(
      false,
    );
  });
});

describe('isReadBy', () => {
  it('compares a message seq with the member’s read cursor', () => {
    expect(isReadBy(5, { lastReadSeq: 5 })).toBe(true);
    expect(isReadBy(5, { lastReadSeq: 9 })).toBe(true);
    expect(isReadBy(5, { lastReadSeq: 4 })).toBe(false);
    expect(isReadBy(1, { lastReadSeq: 0 })).toBe(false);
  });
});
