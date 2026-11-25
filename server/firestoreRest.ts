import crypto from "node:crypto";
import { FsConflict, type FsStore, type MemberDoc } from "./membershipSaga.js";

/**
 * Firestore REST client for the membership docs (collection "members", doc id = full permanent pid). Uses the existing service-account
 * email/key env names (names only) through the OAuth JWT-bearer grant. No firebase-admin dependency. Never logs tokens or keys.
 * Capability is NOT assumed: probeFirestore() must succeed (scratch doc only) before any transition is enabled.
 */
type Fetch = (url: string, init?: any) => Promise<{ status: number; ok: boolean; json: () => Promise<any> }>;
const b64u = (v: Buffer | string) => Buffer.from(v).toString("base64url");
const DEFAULT_PROJECT = "home-1857c";

export function isFirestoreRestConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.FIREBASE_SERVICE_ACCOUNT_EMAIL && env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function makeTokenProvider(env: Record<string, string | undefined>, fetchImpl: Fetch, now: () => number = () => Math.floor(Date.now() / 1000)) {
  let cached: { token: string; exp: number } | null = null;
  return async (): Promise<string> => {
    if (cached && cached.exp - 60 > now()) return cached.token;
    const email = env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
    const key = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!email || !key) throw new Error("Firestore service account is not configured");
    const iat = now();
    const data = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: email, sub: email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }))}`;
    const sig = crypto.createSign("RSA-SHA256").update(data).sign(key);
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${data}.${b64u(sig)}` }).toString(),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(`Firestore token request failed (${res.status})`);
    cached = { token: j.access_token, exp: iat + Math.min(Number(j.expires_in) || 3600, 3600) };
    return cached.token;
  };
}

const toFields = (d: MemberDoc) => ({
  coupleId: { stringValue: d.coupleId }, state: { stringValue: d.state }, txId: { stringValue: d.txId },
  fence: { integerValue: String(d.fence) }, ...(d.prev ? { prev: { stringValue: d.prev } } : {}),
});
const fromFields = (f: any): MemberDoc => ({
  coupleId: f?.coupleId?.stringValue ?? "", state: (f?.state?.stringValue as any) ?? "active", txId: f?.txId?.stringValue ?? "",
  fence: Number(f?.fence?.integerValue ?? 0), ...(f?.prev?.stringValue ? { prev: f.prev.stringValue as any } : {}),
});

export function makeFirestoreMembersStore(opts: { fetch: Fetch; token: () => Promise<string>; project?: string; collection?: string }): FsStore & { rawDocUrl: (collection: string, id: string) => string } {
  const project = opts.project || DEFAULT_PROJECT;
  const collection = opts.collection || "members";
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;
  const docUrl = (c: string, id: string) => `${base}/${encodeURIComponent(c)}/${encodeURIComponent(id)}`;
  const call = async (method: string, url: string, body?: any) => {
    const res = await opts.fetch(url, { method, headers: { Authorization: `Bearer ${await opts.token()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, json };
  };
  const conflict = (r: { status: number; json: any }) => r.status === 409 || r.status === 412 || r.status === 404 || (r.status === 400 && r.json?.error?.status === "FAILED_PRECONDITION");
  return {
    rawDocUrl: docUrl,
    async get(pid) {
      const r = await call("GET", docUrl(collection, pid));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Firestore read failed (${r.status})`);
      return { doc: fromFields(r.json.fields), updateTime: String(r.json.updateTime) };
    },
    async set(pid, doc, pre) {
      const q = "exists" in pre ? "currentDocument.exists=false" : `currentDocument.updateTime=${encodeURIComponent(pre.updateTime)}`;
      const r = await call("PATCH", `${docUrl(collection, pid)}?${q}`, { fields: toFields(doc) });
      if (conflict(r)) throw new FsConflict(`precondition failed (${r.status})`);
      if (!r.ok) throw new Error(`Firestore write failed (${r.status})`);
      return String(r.json.updateTime);
    },
    async del(pid, pre) {
      const r = await call("DELETE", `${docUrl(collection, pid)}?currentDocument.updateTime=${encodeURIComponent(pre.updateTime)}`);
      if (conflict(r)) throw new FsConflict(`precondition failed (${r.status})`);
      if (!r.ok) throw new Error(`Firestore delete failed (${r.status})`);
    },
  };
}

/** Capability probe on an isolated scratch collection ("_capability_probe", random id). Never touches "members". It runs the EXACT calls the saga uses,
 *  through the same store code: create-if-absent, read, update with the returned updateTime, a deliberately stale update that must be a FsConflict,
 *  and a conditional delete with updateTime. A failed cleanup is reported with the scratch id so it can be removed by hand. Not run until approved. */
export async function probeFirestore(opts: { fetch: Fetch; token: () => Promise<string>; project?: string; id?: string }): Promise<{ ok: boolean; step: string; detail?: string; leftover?: string }> {
  const id = opts.id || `probe_${crypto.randomBytes(8).toString("hex")}`;
  try { await opts.token(); } catch (e: any) { return { ok: false, step: "token", detail: String(e?.message || "token failed").slice(0, 120) }; }
  const store = makeFirestoreMembersStore({ fetch: opts.fetch, token: opts.token, project: opts.project, collection: "_capability_probe" });
  const d = (c: string, n: number): any => ({ coupleId: c, state: "transition", txId: "probe", fence: n, prev: "absent" });
  const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); return null; } catch (e: any) { return { ok: false, step: name, detail: String(e?.message || "failed").slice(0, 120) }; } };
  let t1 = "", t2 = "";
  let r: any = await step("create", async () => { await store.set(id, d("p", 1), { exists: false }); });
  if (r) return r;
  const cleanup = async (): Promise<{ ok: boolean; step: string; detail?: string; leftover?: string } | null> => {
    const cur = await store.get(id).catch(() => null);
    if (!cur) return null;
    const c = await step("delete", async () => { await store.del(id, { updateTime: cur.updateTime }); });
    return c ? { ...c, leftover: id } : null;
  };
  const fail = async (x: any) => { const c = await cleanup(); return c ? { ...x, detail: `${x.detail || ""}; cleanup also failed`, leftover: id } : x; };
  r = await step("read", async () => { const g = await store.get(id); if (!g || g.doc.coupleId !== "p" || g.doc.prev !== "absent") throw new Error("read back mismatch"); t1 = g.updateTime; });
  if (r) return fail(r);
  r = await step("update", async () => { t2 = await store.set(id, d("q", 2), { updateTime: t1 }); });
  if (r) return fail(r);
  r = await step("stale-update-must-conflict", async () => {
    try { await store.set(id, d("z", 3), { updateTime: t1 }); } catch (e) { if (e instanceof FsConflict) return; throw e; }
    throw new Error("a stale update was accepted");
  });
  if (r) return fail(r);
  r = await step("delete", async () => { const g = await store.get(id); if (!g || g.doc.coupleId !== "q") throw new Error("stale update changed the doc"); await store.del(id, { updateTime: g.updateTime }); });
  if (r) { const c = await cleanup(); return { ...r, leftover: c ? id : undefined }; }
  return { ok: true, step: "done" };
}
