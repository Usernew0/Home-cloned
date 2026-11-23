import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotp(secret: string, timestampMs = Date.now(), step = 30): string {
  const key = base32Decode(secret);
  if (!key.length) throw new Error("Invalid TOTP secret");
  const counter = Math.floor(timestampMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotp(token: unknown, secret: string, window = 1, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  let ok = false;
  for (let d = -window; d <= window; d++) {
    try {
      const expected = Buffer.from(generateTotp(secret, now + d * 30000));
      const got = Buffer.from(clean);
      if (expected.length === got.length && crypto.timingSafeEqual(expected, got)) ok = true;
    } catch {
      return false;
    }
  }
  return ok;
}

export const normalizeBackupCode = (c: string) => c.replace(/[\s-]/g, "").toUpperCase().trim();

export function consumeBackupCode(input: unknown, stored: string[] = []): { valid: boolean; remaining: string[] } {
  if (typeof input !== "string") return { valid: false, remaining: stored };
  const n = normalizeBackupCode(input);
  if (n.length < 6) return { valid: false, remaining: stored };
  const idx = stored.findIndex((c) => normalizeBackupCode(c) === n);
  if (idx === -1) return { valid: false, remaining: stored };
  return { valid: true, remaining: stored.filter((_, i) => i !== idx) };
}
