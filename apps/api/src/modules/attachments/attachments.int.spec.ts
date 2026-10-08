import { attachmentSchema, LIMITS } from '@chat/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestApp, createUser, type TestApp } from '../../test/app';
import { StorageService } from '../storage/storage.service';

// The smallest valid PNG (1x1 pixel)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(() => t.app.close());

const upload = (
  user: Parameters<TestApp['auth']>[0],
  ...files: { data: Buffer; name?: string; type?: string }[]
) => {
  const req = t.http().post('/api/attachments').set(t.auth(user));
  for (const file of files)
    req.attach('files', file.data, {
      filename: file.name ?? 'photo.png',
      contentType: file.type ?? 'image/png',
    });
  return req;
};
const download = async (url: string) => {
  const res = await fetch(url);
  return {
    status: res.status,
    bytes: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get('content-type'),
  };
};

describe('POST /api/attachments', () => {
  it('stores an image in S3, keeps only metadata in the database, and returns a working URL', async () => {
    const user = await createUser(t.prisma);
    const res = await upload(user, { data: PNG, name: 'cat.png' }).expect(201);

    expect(res.body).toHaveLength(1);
    const dto = attachmentSchema.parse(res.body[0]);
    expect(dto).toMatchObject({ fileName: 'cat.png', mimeType: 'image/png', size: PNG.length });

    const row = await t.prisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row).toMatchObject({
      uploaderId: user.id,
      messageId: null,
      mimeType: 'image/png',
      size: PNG.length,
    });
    expect(row.storageKey).toMatch(new RegExp(`^attachments/${user.id}/[0-9a-f-]{36}\\.png$`));

    const file = await download(dto.url);
    expect(file.status).toBe(200);
    expect(file.bytes.equals(PNG)).toBe(true);
    expect(file.type).toBe('image/png');
  });

  it('accepts several files at once and keeps their order', async () => {
    const user = await createUser(t.prisma);
    const res = await upload(
      user,
      { data: PNG, name: 'one.png' },
      { data: JPEG, name: 'two.jpg', type: 'image/jpeg' },
      { data: PNG, name: 'three.png' },
    ).expect(201);
    expect(res.body.map((a: { fileName: string }) => a.fileName)).toEqual([
      'one.png',
      'two.jpg',
      'three.png',
    ]);
    expect(res.body[1].mimeType).toBe('image/jpeg');
    expect(await t.prisma.attachment.count()).toBe(3);
  });

  it('records upload order, so a message shows its attachments in the order they were sent', async () => {
    const user = await createUser(t.prisma);
    const res = await upload(
      user,
      { data: PNG, name: 'a.png' },
      { data: PNG, name: 'b.png' },
      { data: PNG, name: 'c.png' },
    ).expect(201);
    const rows = await t.prisma.attachment.findMany({
      where: { id: { in: res.body.map((a: { id: string }) => a.id) } },
    });
    const byTime = rows.toSorted((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
    expect(byTime.map((r) => r.fileName)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(new Set(rows.map((r) => r.createdAt.getTime())).size).toBe(3); // strictly increasing, no ties
  });

  it('keeps the files private: the bare object address does not work without the signed URL', async () => {
    const user = await createUser(t.prisma);
    const { url } = (await upload(user, { data: PNG }).expect(201)).body[0];
    const bare = new URL(url);
    bare.search = '';
    expect((await download(bare.toString())).status).toBe(403);
  });

  describe('decides by the content of the file, never by its name or declared type', () => {
    it('accepts a real image that claims to be text', async () => {
      const user = await createUser(t.prisma);
      const res = await upload(user, { data: PNG, name: 'notes.txt', type: 'text/plain' }).expect(
        201,
      );
      expect(res.body[0].mimeType).toBe('image/png');
      const row = await t.prisma.attachment.findUniqueOrThrow({ where: { id: res.body[0].id } });
      expect(row.storageKey.endsWith('.png')).toBe(true); // the extension comes from the content, not from the client
    });

    it.each([
      ['a text file called .png', Buffer.from('definitely not an image')],
      [
        'an SVG (can carry scripts)',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ],
      ['an HTML page', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ])('refuses %s with 415 and stores nothing', async (_name, data) => {
      const user = await createUser(t.prisma);
      const put = vi.spyOn(t.storage, 'upload');
      await upload(user, { data, name: 'evil.png', type: 'image/png' }).expect(415);
      expect(put).not.toHaveBeenCalled();
      expect(await t.prisma.attachment.count()).toBe(0);
    });

    it('checks every file before storing any: one bad file means none are stored', async () => {
      const user = await createUser(t.prisma);
      const put = vi.spyOn(t.storage, 'upload');
      await upload(user, { data: PNG }, { data: Buffer.from('nope') }).expect(415);
      expect(put).not.toHaveBeenCalled();
      expect(await t.prisma.attachment.count()).toBe(0);
    });
  });

  describe('limits', () => {
    it('refuses a file over the size limit with 413', async () => {
      const user = await createUser(t.prisma);
      const tooBig = Buffer.concat([PNG, Buffer.alloc(LIMITS.ATTACHMENT_MAX_BYTES)]);
      await upload(user, { data: tooBig }).expect(413);
      expect(await t.prisma.attachment.count()).toBe(0);
    });

    it('accepts a file right at the limit', async () => {
      const user = await createUser(t.prisma);
      const atLimit = Buffer.concat([PNG, Buffer.alloc(LIMITS.ATTACHMENT_MAX_BYTES - PNG.length)]);
      await upload(user, { data: atLimit }).expect(201);
    });

    it('refuses more files than a message can carry (400)', async () => {
      const user = await createUser(t.prisma);
      const files = Array.from({ length: LIMITS.ATTACHMENTS_PER_MESSAGE + 1 }, () => ({
        data: PNG,
      }));
      await upload(user, ...files).expect(400);
      expect(await t.prisma.attachment.count()).toBe(0);
    });

    it('refuses a request without files (400)', async () => {
      const user = await createUser(t.prisma);
      await t.http().post('/api/attachments').set(t.auth(user)).expect(400);
    });
  });

  describe('file names', () => {
    it.each([
      ['strips directories', '../../etc/evil.png', 'evil.png'],
      ['strips Windows paths', 'C:\\Users\\me\\cat.png', 'cat.png'],
      ['keeps non-latin names intact', 'фото 🐱.png', 'фото 🐱.png'],
    ])('%s', async (_name, sent, stored) => {
      const user = await createUser(t.prisma);
      const res = await upload(user, { data: PNG, name: sent }).expect(201);
      expect(res.body[0].fileName).toBe(stored);
    });

    it('limits very long names to 255 characters', async () => {
      const user = await createUser(t.prisma);
      const res = await upload(user, { data: PNG, name: `${'a'.repeat(400)}.png` }).expect(201);
      expect(res.body[0].fileName.length).toBeLessThanOrEqual(255);
    });
  });

  it('requires authentication', async () => {
    await t.http().post('/api/attachments').attach('files', PNG, 'cat.png').expect(401);
  });

  it('leaves nothing behind when storing fails halfway', async () => {
    const user = await createUser(t.prisma);
    const storage = t.app.get(StorageService);
    const realUpload = storage.upload.bind(storage);
    let calls = 0;
    vi.spyOn(storage, 'upload').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('S3 is down');
      return realUpload(...args);
    });
    const cleanup = vi.spyOn(storage, 'deleteMany');

    await upload(user, { data: PNG }, { data: PNG }).expect(500);
    expect(await t.prisma.attachment.count()).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup.mock.calls[0]![0]).toHaveLength(2); // the first file is removed again
  });
});
