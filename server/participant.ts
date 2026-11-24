/** Permanent participant ids. A pid names ONE account (never a username), is minted by the server at login and bound into the
 *  session, the Firebase token and the Supabase JWT. Kinds keep the three account stores from ever sharing an id space. */
export type PidKind = "u" | "adm" | "leg";

export const PID_PATTERN = /^(u|adm|leg):[^\s]{1,120}$/;

export function makePid(kind: PidKind, id: unknown): string {
  const s = typeof id === "string" || typeof id === "number" ? String(id).trim() : "";
  return s && s.length <= 120 && !/\s/.test(s) ? `${kind}:${s}` : "";
}

/** Permanent ids carry a server-generated random nonce: the account id alone is client-made and an admin can reuse it, so id+nonce is what names an account.
 *  A deleted-and-recreated (or id-edited) account gets a NEW nonce and inherits nothing. No nonce => no pid => no private chat until one exists. */
export const userPid = (row: any): string => (typeof row?.pid_nonce === "string" && row.pid_nonce ? makePid("u", `${row.id}.${row.pid_nonce}`) : "");
export const adminPid = (a: any): string => (typeof a?.pidNonce === "string" && a.pidNonce ? makePid("adm", `${a.id}.${a.pidNonce}`) : "");
export const newNonce = (): string => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");

/** The account id inside a pid ("u:<id>.<nonce>" -> "<id>"). */
export const pidAccountId = (pid: string): string => pid.slice(pid.indexOf(":") + 1).replace(/\.[0-9a-f]{32}$/, "");

export function isPid(v: unknown): v is string {
  return typeof v === "string" && PID_PATTERN.test(v);
}

export type PidResolution = { ok: true; pid: string } | { ok: false; reason: "missing" | "ambiguous" | "no_id" };

const clean = (v: unknown) => (typeof v === "string" ? v.toLowerCase().trim() : "");

/** Resolve a username to ONE account. More than one matching account in any store (case-insensitive), or a match that has no
 *  permanent id, never resolves: the sender is told, nothing is guessed. */
export function resolveUsernamePid(username: string, src: { userRows: any[]; adminAccounts: any[]; legacy?: any }): PidResolution {
  const name = clean(username);
  if (!name) return { ok: false, reason: "missing" };
  const hits: string[] = [];
  for (const u of src.userRows || []) if (clean(u?.username) === name) hits.push(userPid(u));
  for (const a of src.adminAccounts || []) if (clean(a?.username) === name) hits.push(adminPid(a));
  if (!(src.adminAccounts || []).length && src.legacy && clean(src.legacy.username) === name) hits.push(makePid("leg", src.legacy.id));
  if (hits.length === 0) return { ok: false, reason: "missing" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  return hits[0] ? { ok: true, pid: hits[0] } : { ok: false, reason: "no_id" };
}

/** app_metadata of a JWT (payload only, no signature check: the caller got it straight from Supabase auth). Null if it cannot be read. */
export function jwtAppMetadata(token: unknown): Record<string, any> | null {
  try {
    if (typeof token !== "string") return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const md = JSON.parse(json)?.app_metadata;
    return md && typeof md === "object" ? md : null;
  } catch { return null; }
}

/** Fail closed: a Supabase session is only handed out when its JWT names exactly the account that just authenticated. */
export function sessionMatchesIdentity(accessToken: unknown, expected: { pid: string; coupleId: string; role: string }): boolean {
  const md = jwtAppMetadata(accessToken);
  if (!md) return false;
  return (md.pid ?? "") === expected.pid && md.couple_id === expected.coupleId && md.role === expected.role;
}
