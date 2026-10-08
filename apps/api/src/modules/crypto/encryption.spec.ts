import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, type Keyring } from './encryption';
import { EncryptionService, UNREADABLE_MESSAGE } from './encryption.service';

const chatId = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const otherChatId = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';
const messageId = '11111111-1111-4111-8111-111111111111';
const otherMessageId = '22222222-2222-4222-8222-222222222222';

const ring = (currentId: number, ...ids: number[]): Keyring => ({
  currentId,
  keys: new Map(ids.map((id) => [id, Buffer.alloc(32, id)])),
});
const keyring1 = ring(1, 1);
// what Node reports when AES-GCM authentication fails
const AUTH_FAILURE = /unable to authenticate/i;
const flip = (base64: string) => {
  const bytes = Buffer.from(base64, 'base64');
  bytes[0] = bytes[0]! ^ 1;
  return bytes.toString('base64');
};

describe('encrypt / decrypt', () => {
  it('round-trips any text, including emoji and line breaks', () => {
    for (const text of ['hello', 'Привіт, світе! 👋\nsecond line', '', 'a'.repeat(4000)]) {
      expect(decrypt(encrypt(text, keyring1, chatId, messageId), keyring1, chatId, messageId)).toBe(
        text,
      );
    }
  });

  it('never stores the plaintext, and encrypting twice gives different ciphertexts (random IV)', () => {
    const a = encrypt('top secret', keyring1, chatId, messageId);
    const b = encrypt('top secret', keyring1, chatId, messageId);
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret');
    expect(Buffer.from(a.split('.')[3]!, 'base64').toString('utf8')).not.toContain('secret');
  });

  it('is stored as "<keyId>.<iv>.<tag>.<data>"', () => {
    const [keyId, iv, tag, data] = encrypt('x', ring(7, 7), chatId, messageId).split('.');
    expect(keyId).toBe('7');
    expect(Buffer.from(iv!, 'base64')).toHaveLength(12);
    expect(Buffer.from(tag!, 'base64')).toHaveLength(16);
    expect(data).toBeTruthy();
  });

  describe('is bound to where it was written', () => {
    const payload = encrypt('hello', keyring1, chatId, messageId);

    it('fails when moved to another chat', () => {
      expect(() => decrypt(payload, keyring1, otherChatId, messageId)).toThrow(AUTH_FAILURE);
    });

    it('fails when copied onto another message of the same chat', () => {
      expect(() => decrypt(payload, keyring1, chatId, otherMessageId)).toThrow(AUTH_FAILURE);
    });
  });

  describe('detects tampering', () => {
    const [keyId, iv, tag, data] = encrypt('hello', keyring1, chatId, messageId).split('.') as [
      string,
      string,
      string,
      string,
    ];

    it.each([
      ['the ciphertext', [keyId, iv, tag, flip(data)]],
      ['the authentication tag', [keyId, iv, flip(tag), data]],
      ['the IV', [keyId, flip(iv), tag, data]],
    ])('fails when %s is modified', (_name, parts) => {
      expect(() => decrypt(parts.join('.'), keyring1, chatId, messageId)).toThrow(AUTH_FAILURE);
    });

    it.each([
      ['an empty string', ''],
      ['too few parts', '1.abc'],
      ['garbage', 'not encrypted at all'],
    ])('rejects %s as unreadable', (_name, payload) => {
      expect(() => decrypt(payload, keyring1, chatId, messageId)).toThrow(/unreadable/i);
    });
  });

  describe('key rotation', () => {
    it('new messages use the current key, old ones keep decrypting with theirs', () => {
      const old = encrypt('written under key 1', ring(1, 1), chatId, messageId);
      const rotated = ring(2, 1, 2);

      expect(decrypt(old, rotated, chatId, messageId)).toBe('written under key 1');
      const fresh = encrypt('written under key 2', rotated, chatId, otherMessageId);
      expect(fresh.startsWith('2.')).toBe(true);
      expect(decrypt(fresh, rotated, chatId, otherMessageId)).toBe('written under key 2');
    });

    it('fails clearly when the key a message was written with is gone from the ring', () => {
      const payload = encrypt('hi', ring(2, 1, 2), chatId, messageId);
      expect(() => decrypt(payload, ring(1, 1), chatId, messageId)).toThrow(/unreadable/i);
    });

    it('different keys give different ciphertext for the same input', () => {
      const a = encrypt('same', ring(1, 1), chatId, messageId).split('.')[3];
      const b = encrypt('same', ring(2, 2), chatId, messageId).split('.')[3];
      expect(a).not.toBe(b);
    });
  });
});

describe('EncryptionService', () => {
  it('uses the key ring from the environment', () => {
    const service = new EncryptionService();
    const payload = service.encrypt('hello', chatId, messageId);
    expect(payload.startsWith('1.')).toBe(true);
    expect(service.decrypt(payload, chatId, messageId)).toBe('hello');
  });

  it('decryptOrPlaceholder shows a placeholder instead of failing when a message is unreadable', () => {
    const service = new EncryptionService();
    const payload = service.encrypt('hello', chatId, messageId);
    expect(service.decryptOrPlaceholder(payload, chatId, messageId)).toBe('hello');
    expect(service.decryptOrPlaceholder(payload, chatId, otherMessageId)).toBe(UNREADABLE_MESSAGE);
    expect(service.decryptOrPlaceholder('garbage', chatId, messageId)).toBe(UNREADABLE_MESSAGE);
  });
});
