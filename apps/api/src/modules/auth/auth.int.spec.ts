import { meSchema } from '@chat/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, createUser, TEST_PASSWORD, type TestApp } from '../../test/app';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // a fresh app per test also resets the in-memory rate limiter
});
afterEach(() => t.app.close());

const attemptLogIn = (app: TestApp, ip?: string) => {
  const req = app
    .http()
    .post('/api/auth/log-in')
    .send({ username: 'nobody', password: 'wrong-password' });
  return ip ? req.set('X-Forwarded-For', ip) : req;
};

const signUpBody = { email: 'alice@example.com', username: 'alice', password: TEST_PASSWORD };

describe('POST /api/auth/sign-up', () => {
  it('creates the account and returns a token plus the user', async () => {
    const res = await t.http().post('/api/auth/sign-up').send(signUpBody).expect(201);

    expect(meSchema.parse(res.body.user)).toMatchObject({
      username: 'alice',
      email: 'alice@example.com',
    });
    const payload = t.jwt.verify(res.body.accessToken);
    expect(payload.sub).toBe(res.body.user.id);
    // the token carries only the identity, nothing else about the user
    expect(Object.keys(payload).toSorted()).toEqual(['exp', 'iat', 'sub', 'username']);
  });

  it('stores a bcrypt hash, never the password, and never returns it', async () => {
    const res = await t.http().post('/api/auth/sign-up').send(signUpBody).expect(201);
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored.passwordHash).not.toContain(TEST_PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain(stored.passwordHash);
  });

  it('stores the e-mail lower-cased', async () => {
    const res = await t
      .http()
      .post('/api/auth/sign-up')
      .send({ ...signUpBody, email: 'Alice@Example.COM' })
      .expect(201);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('answers 409 for a taken username or e-mail (any letter case), and creates nothing', async () => {
    await createUser(t.prisma, { username: 'alice', email: 'alice@example.com' });

    const sameName = await t
      .http()
      .post('/api/auth/sign-up')
      .send({ ...signUpBody, email: 'other@example.com' })
      .expect(409);
    expect(sameName.body.message).toMatch(/username/i);

    const sameMail = await t
      .http()
      .post('/api/auth/sign-up')
      .send({ ...signUpBody, username: 'other', email: 'ALICE@example.com' })
      .expect(409);
    expect(sameMail.body.message).toMatch(/e-?mail/i);

    expect(await t.prisma.user.count()).toBe(1);
  });

  it.each([
    ['an invalid e-mail', { email: 'nope' }, 'email'],
    ['a username with spaces', { username: 'a b' }, 'username'],
    ['a short password', { password: '1234567' }, 'password'],
    ['a missing field', { username: undefined }, 'username'],
  ])('answers 400 naming the field for %s', async (_name, patch, field) => {
    const res = await t
      .http()
      .post('/api/auth/sign-up')
      .send({ ...signUpBody, ...patch })
      .expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringMatching(new RegExp(`^${field}:`))]),
    );
  });

  it('ignores fields it does not know, so nobody can set internal columns', async () => {
    const res = await t
      .http()
      .post('/api/auth/sign-up')
      .send({ ...signUpBody, id: 'x', passwordHash: 'evil', hideInSearch: true })
      .expect(201);
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(stored.passwordHash).not.toBe('evil');
    expect(stored.hideInSearch).toBe(false);
  });
});

describe('POST /api/auth/log-in', () => {
  beforeEach(() => createUser(t.prisma, { username: 'alice', email: 'alice@example.com' }));

  it('returns a working token for the right credentials', async () => {
    const res = await t
      .http()
      .post('/api/auth/log-in')
      .send({ username: 'alice', password: TEST_PASSWORD })
      .expect(200);
    expect(meSchema.parse(res.body.user).username).toBe('alice');
    await t
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('gives the same 401 for a wrong password and for an unknown user (no account enumeration)', async () => {
    const wrongPassword = await t
      .http()
      .post('/api/auth/log-in')
      .send({ username: 'alice', password: 'wrong-password' })
      .expect(401);
    const unknownUser = await t
      .http()
      .post('/api/auth/log-in')
      .send({ username: 'nobody', password: TEST_PASSWORD })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
  });

  it('answers 400 for a missing password', async () => {
    await t.http().post('/api/auth/log-in').send({ username: 'alice' }).expect(400);
  });

  it('rate-limits repeated attempts: the 6th within a minute gets 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await t
        .http()
        .post('/api/auth/log-in')
        .send({ username: 'alice', password: 'wrong-password' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe('rate limiting behind a reverse proxy', () => {
  it('counts per real client IP when the proxy is trusted (production behind Caddy)', async () => {
    await t.app.close();
    t = await createTestApp({ trustProxy: true });
    for (let i = 0; i < 5; i += 1) await attemptLogIn(t, '10.0.0.1').expect(401);
    await attemptLogIn(t, '10.0.0.1').expect(429);
    await attemptLogIn(t, '10.0.0.2').expect(401); // another client is not affected
  });

  it('ignores X-Forwarded-For when the proxy is not trusted, so it cannot be used to dodge the limit', async () => {
    for (let i = 0; i < 5; i += 1) await attemptLogIn(t, `10.0.0.${i}`).expect(401);
    await attemptLogIn(t, '10.0.0.99').expect(429);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user', async () => {
    const user = await createUser(t.prisma);
    const res = await t.http().get('/api/auth/me').set(t.auth(user)).expect(200);
    expect(meSchema.parse(res.body)).toMatchObject({
      id: user.id,
      username: user.username,
      email: user.email,
    });
  });

  it('answers 401 without a token, with a bad token, or when the account no longer exists', async () => {
    await t.http().get('/api/auth/me').expect(401);
    await t.http().get('/api/auth/me').set('Authorization', 'Bearer nonsense').expect(401);

    const ghost = await createUser(t.prisma);
    const headers = t.auth(ghost);
    await t.prisma.user.delete({ where: { id: ghost.id } });
    await t.http().get('/api/auth/me').set(headers).expect(401);
  });
});

describe('security headers', () => {
  it('sets helmet’s headers on API responses', async () => {
    const res = await t.http().get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
