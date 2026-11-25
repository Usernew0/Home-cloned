/** Passphrase encryption for FULL backup files (AES-256-GCM, key from PBKDF2-SHA256). The passphrase never leaves the browser and is not stored. A lost passphrase cannot be recovered. */
const ITER = 600000;
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(pass: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptText(plain: string, pass: string, iter = ITER): Promise<string> {
  if (pass.length < 12) throw new Error("Passphrase must be at least 12 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(pass, salt, iter), new TextEncoder().encode(plain)));
  return JSON.stringify({ format: "home-full-backup-encrypted", v: 1, kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}
export async function decryptText(envelope: string, pass: string): Promise<string> {
  let e: any; try { e = JSON.parse(envelope); } catch { throw new Error("Not a backup file"); }
  if (e?.format !== "home-full-backup-encrypted" || e.v !== 1) throw new Error("Not a backup file from this panel");
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, await key(pass, unb64(e.salt), Number(e.iter) || ITER), unb64(e.ct))); }
  catch { throw new Error("Wrong passphrase or the file was changed"); }
}
export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}
