import { ALLOWED_IMAGE_TYPES } from '@chat/shared';

export type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * Recognises an allowed image by its first bytes. The name and the Content-Type header come from
 * the client and prove nothing, so they are never used. SVG, HTML and everything else (which could
 * carry scripts) return null.
 */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a')))
    return 'image/gif';
  // RIFF container whose format is WEBP (WAV audio is also RIFF)
  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8))
    return 'image/webp';
  return null;
}
