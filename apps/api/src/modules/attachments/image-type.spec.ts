import { describe, expect, it } from 'vitest';

import { detectImageType } from './image-type';

const bytes = (...values: number[]) =>
  Buffer.from([...values, ...Array.from({ length: 16 }, () => 0)]);
// RIFF container: "RIFF", 4 size bytes, then the format name ("WEBP" for images)
const riff = (format: string) =>
  Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([1, 2, 3, 4]),
    Buffer.from(format, 'latin1'),
  ]);
const ascii = (text: string) => Buffer.concat([Buffer.from(text, 'latin1'), Buffer.alloc(16)]);

describe('detectImageType', () => {
  it.each([
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    ['GIF87a', ascii('GIF87a'), 'image/gif'],
    ['GIF89a', ascii('GIF89a'), 'image/gif'],
    ['WebP', riff('WEBPVP8 '), 'image/webp'],
  ])('recognises %s by its first bytes', (_name, buffer, mime) => {
    expect(detectImageType(buffer)).toBe(mime);
  });

  it('tells WebP apart from other RIFF files such as WAV audio', () => {
    expect(detectImageType(riff('WAVEfmt '))).toBeNull();
  });

  it.each([
    ['plain text', Buffer.from('hello, I am not an image')],
    [
      'an SVG (can carry scripts)',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['an HTML page', Buffer.from('<!doctype html><html></html>')],
    ['a PDF', Buffer.from('%PDF-1.7 ...')],
    ['an empty file', Buffer.alloc(0)],
    ['a file shorter than any signature', Buffer.from([0x89, 0x50])],
  ])('rejects %s', (_name, buffer) => {
    expect(detectImageType(buffer)).toBeNull();
  });
});
