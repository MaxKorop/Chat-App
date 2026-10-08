const USAGE = 'MESSAGE_KEYS must look like "1:<base64 of 32 bytes>[,2:<base64 of 32 bytes>]"';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** "1:<base64>,2:<base64>" → Map(keyId → 32-byte master key) */
export function parseKeyring(raw: string): Map<number, Buffer> {
  const ring = new Map<number, Buffer>();
  for (const part of raw.split(',')) {
    const separator = part.indexOf(':');
    const id = part.slice(0, separator).trim();
    const encoded = part.slice(separator + 1).trim();
    const key = BASE64.test(encoded) ? Buffer.from(encoded, 'base64') : undefined;

    if (separator < 0 || !/^\d+$/.test(id) || key?.length !== 32) throw new Error(USAGE);
    if (ring.has(Number(id))) throw new Error(`${USAGE} (key id ${id} appears twice)`);
    ring.set(Number(id), key);
  }
  return ring;
}
