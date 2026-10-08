import { publicUserSchema } from '@chat/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { befriend, createTestApp, createUser, type TestApp } from '../../test/app';
import { PresenceService } from '../presence/presence.service';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(() => t.app.close());

const names = (body: { username: string }[]) => body.map((u) => u.username).toSorted();

describe('GET /api/users/search', () => {
  it('finds users by part of the name, ignoring case, and never returns the searcher', async () => {
    const me = await createUser(t.prisma, { username: 'alice' });
    await createUser(t.prisma, { username: 'Alicia' });
    await createUser(t.prisma, { username: 'bob' });

    const res = await t
      .http()
      .get('/api/users/search')
      .query({ q: 'ALI' })
      .set(t.auth(me))
      .expect(200);
    expect(names(res.body)).toEqual(['Alicia']);
    res.body.forEach((u: unknown) => publicUserSchema.parse(u));
  });

  it('hides users who opted out of search', async () => {
    const me = await createUser(t.prisma);
    await createUser(t.prisma, { username: 'ghost', hideInSearch: true });
    const res = await t
      .http()
      .get('/api/users/search')
      .query({ q: 'ghost' })
      .set(t.auth(me))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('treats the query as plain text: regex and SQL wildcards do not match everything', async () => {
    const me = await createUser(t.prisma);
    await createUser(t.prisma, { username: 'a.b' });
    await createUser(t.prisma, { username: 'axb' });
    await createUser(t.prisma, { username: 'a_c' });
    await createUser(t.prisma, { username: 'abc' });

    const search = async (q: string) =>
      names(
        (await t.http().get('/api/users/search').query({ q }).set(t.auth(me)).expect(200)).body,
      );
    expect(await search('a.b')).toEqual(['a.b']); // "." is not "any character"
    expect(await search('.*')).toEqual([]); // not a regular expression
    expect(await search('a_c')).toEqual(['a_c']); // "_" is not a LIKE wildcard
    expect(await search('%')).toEqual([]); // neither is "%"
  });

  it('returns an empty list for a blank query and at most 20 results', async () => {
    const me = await createUser(t.prisma);
    for (let i = 0; i < 25; i += 1) await createUser(t.prisma, { username: `many${i}` });
    expect(
      (await t.http().get('/api/users/search').query({ q: '  ' }).set(t.auth(me)).expect(200)).body,
    ).toEqual([]);
    expect(
      (await t.http().get('/api/users/search').query({ q: 'many' }).set(t.auth(me)).expect(200))
        .body,
    ).toHaveLength(20);
  });

  it('flags friends and requires authentication', async () => {
    const [me, friend] = [
      await createUser(t.prisma),
      await createUser(t.prisma, { username: 'pal' }),
    ];
    await befriend(t.prisma, me.id, friend.id);
    const res = await t
      .http()
      .get('/api/users/search')
      .query({ q: 'pal' })
      .set(t.auth(me))
      .expect(200);
    expect(res.body[0].isFriend).toBe(true);
    await t.http().get('/api/users/search').query({ q: 'pal' }).expect(401);
  });
});

describe('GET /api/users/:id', () => {
  it('returns the public profile with live presence', async () => {
    const [me, other] = [
      await createUser(t.prisma),
      await createUser(t.prisma, { about: 'hello' }),
    ];
    const url = `/api/users/${other.id}`;

    expect((await t.http().get(url).set(t.auth(me)).expect(200)).body).toMatchObject({
      about: 'hello',
      isOnline: false,
    });

    t.app.get(PresenceService).connect(other.id);
    const online = (await t.http().get(url).set(t.auth(me)).expect(200)).body;
    expect(publicUserSchema.parse(online).isOnline).toBe(true);
    expect(online).not.toHaveProperty('email');
  });

  it('hides the last-seen time when the user chose to', async () => {
    const [me, other] = [
      await createUser(t.prisma),
      await createUser(t.prisma, { hideLastSeen: true }),
    ];
    const res = await t.http().get(`/api/users/${other.id}`).set(t.auth(me)).expect(200);
    expect(res.body.lastSeenAt).toBeNull();
  });

  it('answers 404 for an unknown user and 400 for an id that is not a uuid', async () => {
    const me = await createUser(t.prisma);
    await t
      .http()
      .get('/api/users/3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b')
      .set(t.auth(me))
      .expect(404);
    await t.http().get('/api/users/not-a-uuid').set(t.auth(me)).expect(400);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates only the fields that were sent', async () => {
    const me = await createUser(t.prisma, { about: 'old' });
    const res = await t
      .http()
      .patch('/api/users/me')
      .set(t.auth(me))
      .send({ about: 'new', hideInSearch: true })
      .expect(200);
    expect(res.body).toMatchObject({ username: me.username, about: 'new', hideInSearch: true });
  });

  it('cannot change the e-mail or password through this endpoint', async () => {
    const me = await createUser(t.prisma);
    await t
      .http()
      .patch('/api/users/me')
      .set(t.auth(me))
      .send({ email: 'x@example.com', passwordHash: 'evil' })
      .expect(200);
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored).toMatchObject({ email: me.email, passwordHash: me.passwordHash });
  });

  it('answers 409 when the new username is taken, and 400 for invalid values', async () => {
    const [me] = [await createUser(t.prisma), await createUser(t.prisma, { username: 'taken' })];
    await t.http().patch('/api/users/me').set(t.auth(me)).send({ username: 'taken' }).expect(409);
    await t
      .http()
      .patch('/api/users/me')
      .set(t.auth(me))
      .send({ about: 'x'.repeat(101) })
      .expect(400);
  });

  it('allows "changing" the username to the same value', async () => {
    const me = await createUser(t.prisma);
    await t
      .http()
      .patch('/api/users/me')
      .set(t.auth(me))
      .send({ username: me.username })
      .expect(200);
  });
});

describe('friends', () => {
  it('adding a friend is instant and mutual, and the friend shows up in the list', async () => {
    const [me, other] = [
      await createUser(t.prisma, { username: 'me' }),
      await createUser(t.prisma, { username: 'other' }),
    ];

    const added = await t.http().post(`/api/users/${other.id}/friend`).set(t.auth(me)).expect(201);
    expect(publicUserSchema.parse(added.body)).toMatchObject({ username: 'other', isFriend: true });

    expect(
      names((await t.http().get('/api/users/me/friends').set(t.auth(me)).expect(200)).body),
    ).toEqual(['other']);
    expect(
      names((await t.http().get('/api/users/me/friends').set(t.auth(other)).expect(200)).body),
    ).toEqual(['me']);
  });

  it('is idempotent: adding twice is fine and creates no duplicates', async () => {
    const [me, other] = [await createUser(t.prisma), await createUser(t.prisma)];
    await t.http().post(`/api/users/${other.id}/friend`).set(t.auth(me)).expect(201);
    await t.http().post(`/api/users/${other.id}/friend`).set(t.auth(me)).expect(201);
    expect(await t.prisma.friendship.count()).toBe(2);
  });

  it('refuses yourself (400), unknown users (404) and users who do not accept requests (403)', async () => {
    const [me, closed] = [
      await createUser(t.prisma),
      await createUser(t.prisma, { allowFriendRequests: false }),
    ];
    await t.http().post(`/api/users/${me.id}/friend`).set(t.auth(me)).expect(400);
    await t
      .http()
      .post('/api/users/3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b/friend')
      .set(t.auth(me))
      .expect(404);
    await t.http().post(`/api/users/${closed.id}/friend`).set(t.auth(me)).expect(403);
    expect(await t.prisma.friendship.count()).toBe(0);
  });

  it('removing a friend removes both directions, and removing a stranger is harmless', async () => {
    const [me, other, stranger] = [
      await createUser(t.prisma),
      await createUser(t.prisma),
      await createUser(t.prisma),
    ];
    await befriend(t.prisma, me.id, other.id);
    await t.http().delete(`/api/users/${other.id}/friend`).set(t.auth(me)).expect(204);
    expect(await t.prisma.friendship.count()).toBe(0);
    await t.http().delete(`/api/users/${stranger.id}/friend`).set(t.auth(me)).expect(204);
  });

  it('lists friends alphabetically with presence, and requires authentication', async () => {
    const me = await createUser(t.prisma);
    const [b, a] = [
      await createUser(t.prisma, { username: 'bravo' }),
      await createUser(t.prisma, { username: 'alpha' }),
    ];
    await befriend(t.prisma, me.id, b.id);
    await befriend(t.prisma, me.id, a.id);
    t.app.get(PresenceService).connect(a.id);

    const res = await t.http().get('/api/users/me/friends').set(t.auth(me)).expect(200);
    expect(res.body.map((u: { username: string }) => u.username)).toEqual(['alpha', 'bravo']);
    expect(res.body[0].isOnline).toBe(true);
    await t.http().get('/api/users/me/friends').expect(401);
  });
});
