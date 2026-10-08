import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface Keyring {
  keys: Map<number, Buffer>; // keyId → 32-byte master key
  currentId: number; // used for new encryptions
}

// One derived key per chat: each key only ever encrypts one chat's messages, which keeps it far
// below AES-GCM's safe limit for random IVs, and one leaked key does not reveal other chats.
const deriveKey = (master: Buffer, chatId: string) =>
  Buffer.from(hkdfSync('sha256', master, 'chat-app/messages', chatId, 32));

// Authenticated but not secret: ties the ciphertext to this chat and this message, so a copy
// moved to another chat or message fails to decrypt instead of showing up there.
const aad = (chatId: string, messageId: string) => Buffer.from(`${chatId}:${messageId}`);

/** AES-256-GCM. Result: "<keyId>.<iv>.<authTag>.<ciphertext>" (the last three base64). */
export function encrypt(plain: string, ring: Keyring, chatId: string, messageId: string): string {
  const master = ring.keys.get(ring.currentId);
  if (!master) throw new Error(`Encryption key ${ring.currentId} is not in the key ring`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(master, chatId), iv);
  cipher.setAAD(aad(chatId, messageId));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    ring.currentId,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join('.');
}

export function decrypt(payload: string, ring: Keyring, chatId: string, messageId: string): string {
  const [keyId, iv, tag, data] = payload.split('.');
  const master = ring.keys.get(Number(keyId));
  // `data` may legitimately be empty (the encryption of an empty string)
  if (!master || !iv || !tag || data === undefined) throw new Error('Unreadable ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(master, chatId),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAAD(aad(chatId, messageId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
