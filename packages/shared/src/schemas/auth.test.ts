import { describe, expect, it } from 'vitest';

import { logInSchema, signUpSchema } from './auth';

const valid = { email: 'alice@example.com', username: 'alice_01', password: 'password123' };

describe('signUpSchema', () => {
  it('accepts a valid sign-up and trims the username', () => {
    expect(signUpSchema.parse({ ...valid, username: '  alice  ' }).username).toBe('alice');
  });

  it.each([
    ['an invalid email', { email: 'not-an-email' }],
    ['a one-character username', { username: 'a' }],
    ['a username with spaces inside', { username: 'ali ce' }],
    ['a username with symbols', { username: 'ali$ce' }],
    ['a 26-character username', { username: 'a'.repeat(26) }],
    ['a 7-character password', { password: '1234567' }],
    ['a password longer than 72 chars (bcrypt limit)', { password: 'x'.repeat(73) }],
  ])('rejects %s', (_name, patch) => {
    expect(signUpSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('logInSchema', () => {
  it('accepts any non-empty password (strength is only checked at sign-up)', () => {
    expect(logInSchema.safeParse({ username: 'alice', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(logInSchema.safeParse({ username: 'alice', password: '' }).success).toBe(false);
  });
});
