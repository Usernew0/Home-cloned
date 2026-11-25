import test from "node:test";
import assert from "node:assert/strict";
import { comparePair, runFsPreflight, makeFsPreflightHandler, listFsCollection } from "../server/fsPreflight";
import { createServerSession } from "../server/auth";
process.env.SESSION_SECRET ||= "x".repeat(40); process.env.SERVER_SESSION_SECRET ||= process.env.SESSION_SECRET;

test("compare by id + space + content, not counts: equal counts can still be unclean", () => {
  const fsDocs = [{ id: "1", title: "a", coupleId: "pa" }, { id: "2", title: "b", coupleId: "pa" }, { id: "3", title: "c", coupleId: "pa" }, { id: "4", title: "d", coupleId: "pb" }];
  const sb = [{ id: "1", title: "a", couple_id: "pa" }, { id: "2", title: "CHANGED", couple_id: "pa" }, { id: "3", title: "c", couple_id: "pX" }, { id: "9", title: "z", couple_id: "pa" }];
  const r = comparePair("milestones", fsDocs, sb);
  assert.equal(r.fsCount, sb.length);
  assert.deepEqual(r.onlyFirestore, ["4"]); assert.deepEqual(r.contentDiffers, ["2"]); assert.deepEqual(r.spaceMismatch, ["3"]); assert.equal(r.onlySupabase, 1); assert.equal(r.clean, false);
});
test("identical stores are clean", () => {
  assert.equal(comparePair("memories", [{ id: "1", title: "a", coupleId: "pa" }], [{ id: "1", title: "a", couple_id: "pa", created_at: "x" }]).clean, true);
});
test("a non-empty Firestore field with no Supabase value is data loss: not clean", () => {
  const r = comparePair("memories", [{ id: "1", title: "a", photoUrl: "http://x", coupleId: "pa" }], [{ id: "1", title: "a", couple_id: "pa" }]);
  assert.equal(r.clean, false); assert.deepEqual(r.fieldMissingInSupabase, [{ id: "1", fields: ["photo_url"] }]);
});
test("different field names on the two sides cannot pass with an empty comparison", () => {
  const r = comparePair("memories", [{ id: "1", imageData: "abc", coupleId: "pa" }], [{ id: "1", media: "abc", couple_id: "pa" }]);
  assert.equal(r.clean, false); assert.deepEqual(r.emptyComparison, ["1"]);
});
test("listFsCollection throws instead of returning a partial list when pages remain", async () => {
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ documents: [{ fields: { id: { stringValue: "x" } } }], nextPageToken: "more" }) });
  await assert.rejects(() => listFsCollection({ fetch, token: async () => "t", project: "p", collection: "memories", max: 3 }), /partial comparison/);
});
test("runFsPreflight pages all rows and never writes; handler is admin-only, 503 when unconfigured", async () => {
  const calls: string[] = [];
  const db: any = { from: (t: string) => ({ select: () => ({ order: () => ({ range: async (a: number) => { calls.push(`${t}:${a}`); return { data: a === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: `i${i}`, couple_id: "pa" })) : [{ id: "tail", couple_id: "pa" }], error: null }; } }) }), insert: () => { throw new Error("write"); }, upsert: () => { throw new Error("write"); }, delete: () => { throw new Error("write"); } }) };
  const out = await runFsPreflight(db, async () => []);
  assert.equal(out.reports[0].sbCount, 1001); assert.equal(out.ready, true);
  assert.ok(calls.includes("milestones:1000"));
  const h = makeFsPreflightHandler(() => db, {});
  const mk = (role: string) => ({ method: "POST", body: {}, headers: { "x-server-session": createServerSession({ username: "a", coupleId: "c", role: role as any, pid: "adm:x" }) }, query: {} }) as any;
  const res = () => { const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(b: any) { r.body = b; return r; } }; return r; };
  const r1 = res(); await h(mk("user"), r1); assert.equal(r1.code, 403);
  const r2 = res(); await h(mk("admin"), r2); assert.equal(r2.code, 503); assert.match(r2.body.error, /refused/);
  const h2 = makeFsPreflightHandler(() => db, { FIREBASE_SERVICE_ACCOUNT_EMAIL: "a@b", FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: "k" });
  const r3 = res(); await h2(mk("admin"), r3); assert.equal(r3.code, 503); assert.match(r3.body.error, /FIREBASE_PROJECT_ID/);
});

test("record op: not recorded when the comparison is unclean; recorded (rpc) only on ready:true; inspect never calls rpc", async () => {
  let rpcCalls: any[] = [];
  const mkDb = (sbRows: any[]) => ({ rpc: async (n: string, a: any) => { rpcCalls.push([n, a]); return { data: "2026-01-01T00:00:00Z", error: null }; }, from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: sbRows, error: null }) }) }) }) });
  const { privateKey } = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }); // throwaway synthetic key
  const env = { FIREBASE_SERVICE_ACCOUNT_EMAIL: "a@b", FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"), FIREBASE_PROJECT_ID: "proj-x" };
  const tokenFetch = (docs: any[]) => async (url: string) => String(url).includes("oauth2") || String(url).includes("token") ? ({ ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) }) : ({ ok: true, status: 200, json: async () => ({ documents: docs }) });
  const mk = () => ({ method: "POST", body: {}, headers: { "x-server-session": createServerSession({ username: "a", coupleId: "c", role: "admin" as any, pid: "adm:x" }) }, query: {} }) as any;
  const res = () => { const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(b: any) { r.body = b; return r; } }; return r; };
  const fsDoc = { fields: { id: { stringValue: "z1" }, title: { stringValue: "only in firestore" }, coupleId: { stringValue: "pa" } } };
  const unclean = makeFsPreflightHandler(() => mkDb([]), env, tokenFetch([fsDoc]), true);
  const r1 = res(); await unclean(mk(), r1);
  assert.equal(r1.code, 409); assert.equal(r1.body.recorded, false); assert.deepEqual(rpcCalls.map((c) => c[0]), ["mem_clear_reconciliation"]);
  // clean: Supabase has the same row => recorded through rpc once, with the project and a hash
  const row = { id: "z1", title: "only in firestore", couple_id: "pa" };
  rpcCalls = [];
  const clean = makeFsPreflightHandler(() => mkDb([row]), env, tokenFetch([fsDoc]), true);
  const r2 = res(); await clean(mk(), r2);
  assert.equal(r2.code, 200); assert.equal(r2.body.recorded, true);
  assert.equal(rpcCalls.length, 1); assert.equal(rpcCalls[0][0], "mem_record_reconciliation"); assert.equal(rpcCalls[0][1].p_project, "proj-x"); assert.match(rpcCalls[0][1].p_report_hash, /^[0-9a-f]{64}$/);
  // inspect mode never records
  rpcCalls = [];
  const inspect = makeFsPreflightHandler(() => mkDb([row]), env, tokenFetch([fsDoc]), false);
  const r3 = res(); await inspect(mk(), r3); assert.equal(r3.body.recorded, undefined); assert.equal(rpcCalls.length, 0);
});
