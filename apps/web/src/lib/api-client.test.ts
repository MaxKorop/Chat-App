import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import { api, toErrorMessage } from './api-client';

let seen: InternalAxiosRequestConfig[];
const reply = (status: number, data: unknown = {}) => {
  api.defaults.adapter = async (config) => {
    seen.push(config);
    const response = { data, status, statusText: '', headers: {}, config };
    if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };
};
const original = api.defaults.adapter;

beforeEach(() => {
  seen = [];
  useAuthStore.setState({ token: null });
});
afterEach(() => {
  api.defaults.adapter = original;
});

describe('api client', () => {
  it('talks to /api on the same origin', () => {
    expect(api.defaults.baseURL).toBe('/api');
  });

  it('sends the token as a Bearer header once logged in, and nothing before', async () => {
    reply(200);
    await api.get('/auth/me');
    expect(seen[0]!.headers.get('Authorization')).toBeFalsy();

    useAuthStore.setState({ token: 'abc.def.ghi' });
    await api.get('/auth/me');
    expect(seen[1]!.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
  });

  it('logs the user out when the server says the token is no good (401)', async () => {
    useAuthStore.setState({ token: 'expired' });
    reply(401, { statusCode: 401, message: 'Unauthorized' });
    await expect(api.get('/auth/me')).rejects.toThrow('Unauthorized');
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('does not log the user out for other errors', async () => {
    useAuthStore.setState({ token: 'good' });
    reply(403, { message: 'You are not a member of this chat' });
    await expect(api.get('/chats/x')).rejects.toThrow('You are not a member of this chat');
    expect(useAuthStore.getState().token).toBe('good');
  });

  it('turns a list of validation problems into one readable message', async () => {
    reply(400, {
      statusCode: 400,
      message: ['email: Invalid email address', 'password: Too small'],
    });
    await expect(api.post('/auth/sign-up', {})).rejects.toThrow(
      'email: Invalid email address\npassword: Too small',
    );
  });
});

describe('toErrorMessage', () => {
  const axiosError = (response?: { status: number; data: unknown }) =>
    new AxiosError(
      'x',
      'ERR',
      undefined,
      null,
      response && ({ ...response, statusText: '', headers: {}, config: {} } as never),
    );

  it.each([
    [
      'a sentence from the server',
      axiosError({ status: 409, data: { message: 'This username is already taken' } }),
      'This username is already taken',
    ],
    [
      'a list from the server',
      axiosError({ status: 400, data: { message: ['a: bad', 'b: worse'] } }),
      'a: bad\nb: worse',
    ],
    ['no answer at all (offline)', axiosError(), 'Cannot reach the server. Check your connection.'],
    [
      'an answer without a message',
      axiosError({ status: 502, data: '<html>Bad gateway</html>' }),
      'Something went wrong',
    ],
    ['an ordinary error', new Error('boom'), 'boom'],
    ['something that is not an error', 'oops', 'Something went wrong'],
  ])('%s', (_name, error, expected) => {
    expect(toErrorMessage(error)).toBe(expected);
  });
});
