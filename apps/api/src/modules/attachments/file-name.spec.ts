import { describe, expect, it } from 'vitest';

import { sanitizeFileName } from './file-name';

const sanitize = (name: string) => sanitizeFileName(name, 'image.png');

describe('sanitizeFileName', () => {
  it.each([
    ['cat.png', 'cat.png'],
    ['фото 🐱.png', 'фото 🐱.png'],
    ['../../etc/evil.png', 'evil.png'],
    ['/absolute/path/cat.png', 'cat.png'],
    ['C:\\Users\\me\\cat.png', 'cat.png'],
    ['ca\u0000t\u0007\u001f.png', 'cat.png'],
    ['  padded.png  ', 'padded.png'],
  ])('%j → %j', (input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });

  it.each(['', '   ', '..', 'dir/', '\u0000\u0001'])('falls back for %j', (input) => {
    expect(sanitize(input)).toBe(input === '..' ? '..' : 'image.png');
  });

  it('shortens very long names to 255 characters but keeps the extension', () => {
    const result = sanitize(`${'a'.repeat(400)}.png`);
    expect(result).toHaveLength(255);
    expect(result.endsWith('.png')).toBe(true);
  });
});
