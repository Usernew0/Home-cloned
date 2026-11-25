// SYNTHETIC: fake fetch. Not a real Firestore result.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { makeFirestoreMembersStore, probeFirestore, makeTokenProvider } from "../server/firestoreRest.ts";
import { FsConflict } from "../server/membershipSaga.ts";

function fakeFs() {
  const docs = new Map<string, { fields: any; t: number }>(); let clock = 1; const calls: string[] = [];
  const f = async (url: string, init: any = {}) => {
    const m = String(init.method || "GET"); calls.push(`${m} ${url.replace(/^https:\/\/firestore.googleapis.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\//, "")}`);
    const u = new URL(url); const key = decodeURIComponent(u.pathname.split("/documents/")[1]); const d = docs.get(key);
    const res = (status: number, json: any = {}) => ({ status, ok: status < 300, json: async () => json });
    if (m === "GET") return d ? res(200, { fields: d.fields, updateTime: String(d.t) }) : res(404, {});
    if (m === "PATCH") {
      if (u.searchParams.get("currentDocument.exists") === "false" && d) return res(409, { error: { status: "ALREADY_EXISTS" } });
      const ut = u.searchParams.get("currentDocument.updateTime");
      if (ut && (!d || String(d.t) !== ut)) return res(400, { error: { status: "FAILED_PRECONDITION" } });
      const t = clock++; docs.set(key, { fields: JSON.parse(init.body).fields, t }); return res(200, { updateTime: String(t) });
    }
    if (m === "DELETE") { const ut = u.searchParams.get("currentDocument.updateTime"); if (ut && (!d || String(d.t) !== ut)) return res(400, { error: { status: "FAILED_PRECONDITION" } }); docs.delete(key); return res(200); }
    return res(500);
  };
  return { f: f as any, docs, calls };
}
const tok = async () => "T";

test("members store: create-if-absent, conditional update, conditional delete, full pid as doc id", async () => {
  const w = fakeFs(); const s = makeFirestoreMembersStore({ fetch: w.f, token: tok });
  const pid = "u:abc.0123456789abcdef0123456789abcdef";
  assert.equal(await s.get(pid), null);
  await s.set(pid, { coupleId: "pa", state: "transition", txId: "t1", fence: 1, prev: "absent" }, { exists: false });
  await assert.rejects(s.set(pid, { coupleId: "pa", state: "active", txId: "t", fence: 1 }, { exists: false }), FsConflict);
  const r = (await s.get(pid))!; assert.equal(r.doc.state, "transition"); assert.equal(r.doc.prev, "absent");
  await assert.rejects(s.set(pid, { coupleId: "pb", state: "active", txId: "t2", fence: 2 }, { updateTime: "stale" }), FsConflict);
  await s.set(pid, { coupleId: "pb", state: "active", txId: "t2", fence: 2 }, { updateTime: r.updateTime });
  const r2 = (await s.get(pid))!; await assert.rejects(s.del(pid, { updateTime: "stale" }), FsConflict);
  await s.del(pid, { updateTime: r2.updateTime }); assert.equal(await s.get(pid), null);
  assert.ok(w.calls.every((c) => c.includes("members/u%3Aabc.0123456789abcdef0123456789abcdef")));
});
test("probe runs the exact saga calls on the scratch collection only, never members, and cleans up", async () => {
  const w = fakeFs(); const p = await probeFirestore({ fetch: w.f, token: tok, id: "probe_x" });
  assert.deepEqual(p, { ok: true, step: "done" });
  assert.ok(w.calls.every((c) => c.includes("_capability_probe/probe_x")) && !w.calls.some((c) => c.includes("members")));
  assert.ok(w.calls.some((c) => c.startsWith("PATCH")) && w.calls.filter((c) => c.startsWith("PATCH")).length === 3 && w.calls.some((c) => c.startsWith("DELETE")));
  assert.equal(w.docs.size, 0);
});
test("probe fails when a stale update is accepted (precondition not honored), and cleans up", async () => {
  const w = fakeFs(); const lax = async (url: string, init: any = {}) => (init.method === "PATCH" && url.includes("updateTime=") ? w.f(url.replace(/currentDocument.updateTime=[^&]*/, "x=1"), init) : w.f(url, init));
  const p = await probeFirestore({ fetch: lax as any, token: tok, id: "probe_y" });
  assert.equal(p.ok, false);
  assert.equal(w.docs.size, 0);
});
test("probe reports a denied create with its step and no secrets", async () => {
  const denied = async () => ({ status: 403, ok: false, json: async () => ({ error: { message: "secret detail" } }) });
  const p = await probeFirestore({ fetch: denied as any, token: tok });
  assert.equal(p.ok, false); assert.equal(p.step, "create"); assert.ok(!JSON.stringify(p).includes("secret"));
});
test("probe: a failing cleanup is reported with the scratch id", async () => {
  const w = fakeFs(); const noDelete = async (url: string, init: any = {}) => (init.method === "DELETE" ? { status: 403, ok: false, json: async () => ({}) } : w.f(url, init));
  const p = await probeFirestore({ fetch: noDelete as any, token: tok, id: "probe_z" });
  assert.equal(p.ok, false); assert.equal(p.leftover, "probe_z");
});
test("token provider caches, never leaks the key in the error", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  let n = 0; const f = async () => { n++; return { status: 200, ok: true, json: async () => ({ access_token: "AT", expires_in: 3600 }) }; };
  const env = { FIREBASE_SERVICE_ACCOUNT_EMAIL: "x@y.iam", FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: pem.replace(/\n/g, "\\n") };
  const t = makeTokenProvider(env, f as any, () => 1000);
  assert.equal(await t(), "AT"); assert.equal(await t(), "AT"); assert.equal(n, 1);
  const bad = makeTokenProvider({}, f as any); await assert.rejects(bad(), /not configured/);
});
