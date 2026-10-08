import { extname } from 'node:path';

const MAX_NAME_LENGTH = 255;

/** Keeps only the last path segment, drops control characters and limits the length. */
export function sanitizeFileName(original: string, fallback: string): string {
  const base = original
    .split(/[\\/]/)
    .pop()!
    .replace(/\p{Cc}/gu, '') // control characters
    .trim();
  if (!base) return fallback;
  if (base.length <= MAX_NAME_LENGTH) return base;
  const extension = extname(base).slice(0, 16);
  return base.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}
