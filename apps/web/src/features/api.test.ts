// The REST wrappers are thin, so the useful test is a contract test: each one must call exactly the
// route documented in docs/api.md, with the right method, parameters and body.
import type { InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';

import { api } from '@/lib/api-client';

import { getMe, logIn, signUp } from './auth/api';
import { createChat, getChat, getChats, joinChat, searchChats } from './chats/api';
import { getMessages, uploadAttachments } from './messages/api';
import { addFriend, getFriends, getUser, removeFriend, searchUsers, updateMe } from './users/api';

type Call = {
  method?: string;
  url?: string;
  params?: unknown;
  body?: unknown;
  signal?: unknown;
  isForm: boolean;
};
let calls: Call[];

beforeEach(() => {
  calls = [];
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const isForm = config.data instanceof FormData;
    calls.push({
      method: config.method,
      url: config.url,
      params: config.params,
      body: isForm || config.data === undefined ? config.data : JSON.parse(config.data as string),
      signal: config.signal,
      isForm,
    });
    return { data: [], status: 200, statusText: 'OK', headers: {}, config };
  };
});

const ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const last = () => calls.at(-1)!;

describe('auth', () => {
  it('signUp, logIn and getMe', async () => {
    const credentials = { email: 'a@example.com', username: 'alice', password: 'password123' };
    await signUp(credentials);
    expect(last()).toMatchObject({ method: 'post', url: '/auth/sign-up', body: credentials });
    await logIn({ username: 'alice', password: 'password123' });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/auth/log-in',
      body: { username: 'alice', password: 'password123' },
    });
    await getMe();
    expect(last()).toMatchObject({ method: 'get', url: '/auth/me' });
  });
});

describe('users', () => {
  it('search, profile, update, friends', async () => {
    await searchUsers('ali');
    expect(last()).toMatchObject({ method: 'get', url: '/users/search', params: { q: 'ali' } });
    await getUser(ID);
    expect(last()).toMatchObject({ method: 'get', url: `/users/${ID}` });
    await updateMe({ about: 'hi', hideInSearch: true });
    expect(last()).toMatchObject({
      method: 'patch',
      url: '/users/me',
      body: { about: 'hi', hideInSearch: true },
    });
    await getFriends();
    expect(last()).toMatchObject({ method: 'get', url: '/users/me/friends' });
    await addFriend(ID);
    expect(last()).toMatchObject({ method: 'post', url: `/users/${ID}/friend` });
    await removeFriend(ID);
    expect(last()).toMatchObject({ method: 'delete', url: `/users/${ID}/friend` });
  });

  it('passes the abort signal on to searches, so a stale search can be cancelled', async () => {
    const controller = new AbortController();
    await searchUsers('a', controller.signal);
    expect(last().signal).toBe(controller.signal);
  });
});

describe('chats', () => {
  it('list, search, create, details, join', async () => {
    await getChats();
    expect(last()).toMatchObject({ method: 'get', url: '/chats' });
    await searchChats('study');
    expect(last()).toMatchObject({ method: 'get', url: '/chats/search', params: { q: 'study' } });
    await createChat({ type: 'DIRECT', userId: ID });
    expect(last()).toMatchObject({
      method: 'post',
      url: '/chats',
      body: { type: 'DIRECT', userId: ID },
    });
    await getChat(ID);
    expect(last()).toMatchObject({ method: 'get', url: `/chats/${ID}` });
    await joinChat(ID);
    expect(last()).toMatchObject({ method: 'post', url: `/chats/${ID}/join` });
  });
});

describe('messages', () => {
  it('history is paged backwards with `before`', async () => {
    await getMessages(ID, undefined);
    expect(last()).toMatchObject({ method: 'get', url: `/chats/${ID}/messages`, params: {} });
    await getMessages(ID, 42);
    expect(last().params).toEqual({ before: 42 });
  });

  it('files go up as multipart form data, in a field called "files"', async () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ];
    await uploadAttachments(files);
    expect(last()).toMatchObject({ method: 'post', url: '/attachments', isForm: true });
    expect((last().body as FormData).getAll('files').map((f) => (f as File).name)).toEqual([
      'a.png',
      'b.png',
    ]);
  });
});
