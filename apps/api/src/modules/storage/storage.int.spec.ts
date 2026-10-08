import { randomUUID } from 'node:crypto';

import { DeleteBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../config/env';
import { storageConfigFromEnv } from './storage.config';
import { StorageService } from './storage.service';

// A bucket of its own, so these tests never touch what the HTTP tests store.
const config = { ...storageConfigFromEnv(env), bucket: `storage-spec-${randomUUID()}-test` };
const storage = new StorageService(config);
const admin = new S3Client({
  region: config.region,
  endpoint: config.endpoint,
  forcePathStyle: config.forcePathStyle,
  credentials: config.credentials,
});

const key = () => `attachments/test/${randomUUID()}.txt`;
const fetchUrl = async (url: string) => {
  const res = await fetch(url);
  return { status: res.status, body: await res.text(), type: res.headers.get('content-type') };
};

beforeAll(() => storage.onModuleInit());
afterAll(async () => {
  await admin.send(new DeleteBucketCommand({ Bucket: config.bucket })).catch(() => undefined);
  admin.destroy();
});

describe('StorageService', () => {
  it('creates the bucket on startup when it does not exist', async () => {
    await expect(
      admin.send(new HeadBucketCommand({ Bucket: config.bucket })),
    ).resolves.toBeDefined();
    await expect(storage.onModuleInit()).resolves.toBeUndefined(); // and is fine when it already exists
  });

  it('leaves bucket creation alone when told not to (production)', async () => {
    const missing = new StorageService({
      ...config,
      bucket: `never-created-${randomUUID()}-test`,
      createBucket: false,
    });
    await missing.onModuleInit();
    await expect(
      admin.send(new HeadBucketCommand({ Bucket: `never-created-${randomUUID()}-test` })),
    ).rejects.toBeDefined();
  });

  it('stores an object and hands out a URL that works without any credentials', async () => {
    const objectKey = key();
    await storage.upload(objectKey, Buffer.from('hello attachment'), 'text/plain');

    const url = await storage.getUrl(objectKey);
    expect(await fetchUrl(url)).toEqual({
      status: 200,
      body: 'hello attachment',
      type: 'text/plain',
    });
  });

  it('signs URLs for the address the browser can reach', async () => {
    const url = new URL(await storage.getUrl(key()));
    expect(url.origin).toBe(new URL(config.publicEndpoint ?? config.endpoint!).origin);
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
  });

  it('keeps objects private: no signature, no access', async () => {
    const objectKey = key();
    await storage.upload(objectKey, Buffer.from('secret'), 'text/plain');
    const unsigned = new URL(await storage.getUrl(objectKey));
    unsigned.search = '';
    expect((await fetchUrl(unsigned.toString())).status).toBe(403);
  });

  it('rejects a tampered signature and a URL re-pointed to another object', async () => {
    const [a, b] = [key(), key()];
    await storage.upload(a, Buffer.from('a'), 'text/plain');
    await storage.upload(b, Buffer.from('b'), 'text/plain');
    const url = await storage.getUrl(a);

    expect((await fetchUrl(`${url}0`)).status).toBe(403);
    expect((await fetchUrl(url.replace(a, b))).status).toBe(403);
  });

  it('expires URLs', async () => {
    const objectKey = key();
    await storage.upload(objectKey, Buffer.from('short-lived'), 'text/plain');
    const url = await storage.getUrl(objectKey, { expiresIn: 1 });
    expect((await fetchUrl(url)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect((await fetchUrl(url)).status).toBe(403);
  });

  it('deletes many objects at once, and tolerates missing keys and an empty list', async () => {
    const keys = [key(), key()];
    await Promise.all(keys.map((k) => storage.upload(k, Buffer.from('x'), 'text/plain')));
    const urls = await Promise.all(keys.map((k) => storage.getUrl(k)));

    await storage.deleteMany([...keys, key()]);
    expect((await Promise.all(urls.map(fetchUrl))).map((r) => r.status)).toEqual([404, 404]);
    await expect(storage.deleteMany([])).resolves.toBeUndefined();
  });
});
