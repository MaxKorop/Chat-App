import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://chat:chat@localhost:5432/chat',
  JWT_SECRET: 'x'.repeat(32),
  MESSAGE_KEYS: `1:${Buffer.alloc(32, 7).toString('base64')}`,
  MESSAGE_KEY_ID: '1',
  S3_BUCKET: 'bucket',
};

describe('parseEnv', () => {
  it('applies defaults and converts types', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_EXPIRES_IN: '7d',
      S3_REGION: 'us-east-1',
    });
    expect(env.MESSAGE_KEY_ID).toBe(1);
    expect(env.MESSAGE_KEYS.get(1)).toEqual(Buffer.alloc(32, 7));
    expect(env.S3_ENDPOINT).toBeUndefined(); // production uses the AWS default and the instance role
  });

  it('treats empty optional values (a bare `S3_ENDPOINT=` line in .env) as not set', () => {
    const env = parseEnv({
      ...valid,
      S3_ENDPOINT: '',
      S3_PUBLIC_ENDPOINT: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
    });
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.S3_ACCESS_KEY_ID).toBeUndefined();
  });

  it('reads PORT as a number', () => {
    expect(parseEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'not a url' }],
    ['JWT_SECRET', { JWT_SECRET: 'too-short' }],
    ['MESSAGE_KEYS', { MESSAGE_KEYS: 'garbage' }],
    ['MESSAGE_KEY_ID', { MESSAGE_KEY_ID: undefined }],
    ['S3_BUCKET', { S3_BUCKET: '' }],
    ['S3_ENDPOINT', { S3_ENDPOINT: 'localhost' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
  ])('names %s when it is wrong', (name, patch) => {
    expect(() => parseEnv({ ...valid, ...patch })).toThrow(
      new RegExp(`Invalid environment[\\s\\S]*${name}`),
    );
  });

  it('rejects a current key id that is not in the key ring', () => {
    expect(() => parseEnv({ ...valid, MESSAGE_KEY_ID: '2' })).toThrow(
      /MESSAGE_KEY_ID.*MESSAGE_KEYS/,
    );
  });

  it('reports every problem at once, not only the first', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*MESSAGE_KEYS/);
  });
});
