import { describe, expect, it } from 'vitest';

import { storageConfigFromEnv } from './storage.config';

const base = { NODE_ENV: 'development', S3_BUCKET: 'bucket', S3_REGION: 'eu-west-1' } as const;

describe('storageConfigFromEnv', () => {
  it('local development: custom endpoint, explicit dev credentials, creates the bucket', () => {
    expect(
      storageConfigFromEnv({
        ...base,
        S3_ENDPOINT: 'http://seaweed:8333',
        S3_PUBLIC_ENDPOINT: 'http://localhost:8333',
        S3_ACCESS_KEY_ID: 'dev',
        S3_SECRET_ACCESS_KEY: 'dev',
      }),
    ).toEqual({
      bucket: 'bucket',
      region: 'eu-west-1',
      endpoint: 'http://seaweed:8333',
      publicEndpoint: 'http://localhost:8333',
      credentials: { accessKeyId: 'dev', secretAccessKey: 'dev' },
      forcePathStyle: true, // custom endpoints have no per-bucket DNS names
      createBucket: true,
      requestTimeoutMs: 30_000,
    });
  });

  it('the public endpoint defaults to the endpoint', () => {
    const config = storageConfigFromEnv({ ...base, S3_ENDPOINT: 'http://localhost:8333' });
    expect(config.publicEndpoint).toBe('http://localhost:8333');
  });

  it('production on AWS: no endpoint, no keys (the instance role is used), bucket is not created', () => {
    const config = storageConfigFromEnv({ ...base, NODE_ENV: 'production' });
    expect(config).toMatchObject({
      endpoint: undefined,
      publicEndpoint: undefined,
      credentials: undefined,
      forcePathStyle: false,
      createBucket: false,
    });
  });

  it('does not use half a credential pair', () => {
    expect(storageConfigFromEnv({ ...base, S3_ACCESS_KEY_ID: 'dev' }).credentials).toBeUndefined();
  });

  it('creates the bucket in test, and never in production even with a custom endpoint', () => {
    expect(storageConfigFromEnv({ ...base, NODE_ENV: 'test' }).createBucket).toBe(true);
    expect(
      storageConfigFromEnv({ ...base, NODE_ENV: 'production', S3_ENDPOINT: 'http://minio:9000' })
        .createBucket,
    ).toBe(false);
  });
});
