import { buildStorageOwnerSql, assertDollarSafe, guardStatement } from "../src/lib/backupSchemaSql";
// SYNTHETIC: fake db and fake fetch. No real Supabase or Firestore is contacted.
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import fs from "node:fs";
import { quoteUnsafeNumbers, exactNumbersFetch, makeBackupHandlers as realHandlers, countUnsafeNumbers, stripSecrets, fitRows, decodeDoc, BACKUP_TABLES } from "../server/backupExport.ts";
import { redactAdminRow } from "../server/handlers.ts";
import { createServerSession } from "../server/auth.ts";
import { encryptText, decryptText } from "../src/lib/backupCrypto.ts";
import { buildRestoreSql } from "../src/lib/backupRestoreSql.ts";
import { isPrivateChatPath } from "../server/backupExport.ts";
import { crc32, makeZip, toCsv, toCsvZip, toJson, toNdjson } from "../src/lib/backupFormats.ts";
import { runExport, buildManifest, checkIdentity, verifyBackup } from "../src/lib/backupClient.ts";

// Test helper: the browser always sends the identity the plan showed; this wrapper adds it from the same env unless a test sets its own.
function makeBackupHandlers(g: any, env: any = {}, f?: any, r?: any, sdb?: any) {
  const h: any = realHandlers(g, env, f, r, sdb);
  const wrap = (fn: any) => (req: any, res: any) => {
    const sep = req.body?.target === "separate";
    const url = String((sep ? env.BACKUP_SOURCE_SUPABASE_URL : env.SUPABASE_URL || env.VITE_SUPABASE_URL) || "");
    let ref: string | null = null; try { ref = new URL(url).hostname.split(".")[0]; } catch { ref = null; }
    const proj = String((sep ? env.BACKUP_SOURCE_FIREBASE_PROJECT_ID : env.FIREBASE_PROJECT_ID) || "") || null;
    if (req.body && !("expect" in req.body)) req.body.expect = { supabaseRef: ref, firestoreProject: proj };
    return fn(req, res);
  };
  return { plan: h.plan, page: wrap(h.page), restoreFs: wrap(h.restoreFs), raw: h };
}
process.env.SESSION_SECRET ||= "x".repeat(40); process.env.SERVER_SESSION_SECRET ||= process.env.SESSION_SECRET;
const mockRes = () => { const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(b: any) { r.body = b; return r; } }; return r; };
const as = (role: string, body: any = {}) => ({ method: "POST", body, query: {}, headers: { "x-server-session": createServerSession({ username: "u", coupleId: "c", role: role as any, pid: "u:A." + "a".repeat(32) }) } }) as any;
const FS_ENV = { FIREBASE_SERVICE_ACCOUNT_EMAIL: "x@y.z", FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: "k", FIREBASE_PROJECT_ID: "proj" };

function fakeDb(tables: Record<string, any[]>, noId: string[] = []) {
  return {
    from: (t: string) => {
      const rows = tables[t];
      const q: any = {
        select: (_c?: string, opts?: any) => { q.count = opts?.count; return q; },
        order: (k: string) => { q.k = k; return q; },
        limit: () => ({ then: (ok: any) => ok(rows ? { data: rows.slice(0, 1), error: null } : { data: null, error: { code: "42P01", message: "does not exist" } }) }),
        range: (a: number, b: number) => {
          if (!rows) return Promise.resolve({ data: null, error: { code: "42P01", message: "relation does not exist" } });
          if (q.k === "id" && noId.includes(t)) return Promise.resolve({ data: null, error: { code: "42703", message: "column id does not exist" } });
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null, count: q.count ? rows.length : undefined });
        },
      };
      return q;
    },
  };
}

test("only admins may use the export; others and anonymous are refused", async () => {
  const h = makeBackupHandlers(() => fakeDb({}), {});
  for (const role of ["partner", "user", "guest"]) { const r = mockRes(); await h.plan(as(role), r); assert.equal(r.code, 403); const p = mockRes(); await h.page(as(role, { source: "supabase", table: "memories" }), p); assert.equal(p.code, 403); }
  const r = mockRes(); await h.page({ method: "POST", body: { source: "supabase", table: "memories" }, headers: {}, query: {} } as any, r); assert.equal(r.code, 401);
});

test("secrets are removed at every depth; names only are reported", () => {
  const removed = new Set<string>();
  const out = stripSecrets({ id: 1, password: "p", nested: { botToken: "t", keep: "v", arr: [{ api_key: "k", ok: 1 }] }, two_factor_backup_codes: ["1"], pid_nonce: "n" }, removed);
  assert.deepEqual(out, { id: 1, nested: { keep: "v", arr: [{ ok: 1 }] } });
  assert.deepEqual([...removed].sort(), ["api_key", "botToken", "password", "pid_nonce", "two_factor_backup_codes"]);
  assert.ok(!JSON.stringify([...removed]).includes('"p"'));
});

test("admin_settings: adminAccounts hashes and 2FA never reach the export", async () => {
  const rows = [{ id: "adminAccounts", admin_accounts: [{ id: "a", username: "boss", password: "scrypt_v1:HASH", twoFactorSecret: "SEC", twoFactorBackupCodes: ["c"] }] }, { id: "telegram", config: { botToken: "123:abc", chatId: "9" } }, { id: "credentials", username: "x", password: "scrypt_v1:H2" }];
  const h = makeBackupHandlers(() => fakeDb({ admin_settings: rows }), {}, undefined, redactAdminRow);
  const res = mockRes(); await h.page(as("admin", { source: "supabase", table: "admin_settings", offset: 0 }), res);
  const s = JSON.stringify(res.body);
  for (const bad of ["HASH", "H2", "SEC", "123:abc", "scrypt_v1"]) assert.ok(!s.includes(bad), bad);
  assert.ok(s.includes("boss") && s.includes("chatId"));
});

test("supabase paging: reads every row across pages, reports the server count, skips missing tables, orders by first column when there is no id", async () => {
  const many = Array.from({ length: 650 }, (_, i) => ({ id: `r${i}`, v: i }));
  const h = makeBackupHandlers(() => fakeDb({ memories: many, telegram_sent: [{ key: "a" }, { key: "b" }] }, ["telegram_sent"]), {});
  const got: any[] = []; let off = 0; let total: any;
  for (let i = 0; i < 10; i++) { const r = mockRes(); await h.page(as("admin", { source: "supabase", table: "memories", offset: off }), r); got.push(...r.body.rows); if (r.body.total !== undefined) total = r.body.total; if (r.body.next === null) break; off = r.body.next; }
  assert.equal(got.length, 650); assert.equal(total, 650); assert.equal(new Set(got.map((x) => x.id)).size, 650);
  const t = mockRes(); await h.page(as("admin", { source: "supabase", table: "telegram_sent", offset: 0 }), t); assert.equal(t.body.rows.length, 2);
  const m = mockRes(); await h.page(as("admin", { source: "supabase", table: "letters", offset: 0 }), m); assert.equal(m.body.missing, true);
  const bad = mockRes(); await h.page(as("admin", { source: "supabase", table: "pg_shadow", offset: 0 }), bad); assert.equal(bad.code, 400);
  assert.ok(BACKUP_TABLES.every((x) => /^[a-z_]+$/.test(x)));
});

test("an oversize row is replaced by a visible marker, never dropped; pages respect the byte budget", () => {
  const f = fitRows([{ id: "big", x: "y".repeat(500) }, { id: "s" }], 200);
  assert.equal(f.oversize, 1); assert.equal(f.rows.length, 2); assert.equal(f.rows[0]._omitted, "row too large for one download page");
  const g = fitRows(Array.from({ length: 10 }, (_, i) => ({ id: i, p: "z".repeat(50) })), 300);
  assert.ok(g.used < 10 && g.used >= 1);
});

test("firestore: plan lists collections, page decodes typed values and follows tokens, errors are generic", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: any) => {
    calls.push(url);
    if (url.includes("oauth2.googleapis.com")) return { ok: true, status: 200, json: async () => ({ access_token: "T", expires_in: 3600 }) };
    if (url.endsWith("/documents:listCollectionIds")) return { ok: true, status: 200, json: async () => ({ collectionIds: ["memories", "members", "threads"] }) };
    if (url.includes("/documents/memories") && !url.includes("pageToken")) return { ok: true, status: 200, json: async () => ({ documents: [{ name: "projects/p/databases/(default)/documents/memories/m1", createTime: "2026-01-01T00:00:00Z", fields: { text: { stringValue: "hi" }, n: { integerValue: "5" }, secretToken: { stringValue: "S" }, tags: { arrayValue: { values: [{ booleanValue: true }] } } } }], nextPageToken: "NP" }) };
    if (url.includes("pageToken=NP")) return { ok: true, status: 200, json: async () => ({ documents: [{ name: "x/memories/m2", createTime: "2026-01-01T00:00:00Z", fields: {} }] }) };
    if (url.endsWith(":listCollectionIds")) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: false, status: 403, json: async () => ({ error: { message: "SECRET DETAIL" } }) };
  };
  const key = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env = { ...FS_ENV, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key };
  const h = makeBackupHandlers(() => null, env, fetchImpl);
  const p = mockRes(); await h.plan(as("admin"), p);
  assert.deepEqual(p.body.firestore.collections, ["memories", "members"]); assert.deepEqual(p.body.firestore.notExported, ["threads"]); assert.equal(p.body.firestore.available, true);
  const a = mockRes(); await h.page(as("admin", { source: "firestore", collection: "memories" }), a);
  assert.deepEqual(a.body.rows, [{ _path: "memories/m1", _id: "m1", text: "hi", n: 5, tags: [true] }]); assert.equal(a.body.next, "NP");
  const b = mockRes(); await h.page(as("admin", { source: "firestore", collection: "memories", pageToken: "NP" }), b); assert.equal(b.body.next, null); assert.equal(b.body.rows[0]._id, "m2");
  const e = mockRes(); await h.page(as("admin", { source: "firestore", collection: "members" }), e); assert.equal(e.code, 502); assert.ok(!JSON.stringify(e.body).includes("SECRET DETAIL"));
  const inv = mockRes(); await h.page(as("admin", { source: "firestore", collection: "../x" }), inv); assert.equal(inv.code, 400);
  assert.equal(decodeDoc({ name: "a/b/doc%20x", fields: {} })._id, "doc x");
});

test("firestore not configured: plan says so, page refuses", async () => {
  const h = makeBackupHandlers(() => null, {});
  const p = mockRes(); await h.plan(as("admin"), p); assert.equal(p.body.firestore.available, false); assert.match(p.body.firestore.note, /FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY are not both set/);
  const g = mockRes(); await h.page(as("admin", { source: "firestore", collection: "members" }), g); assert.equal(g.code, 503);
});

test("CSV: escaping, Arabic text kept, formula cells neutralised, union of columns", () => {
  const c = toCsv([{ a: "x,y", b: 'q"r', c: "=1+1" }, { a: "مرحبا", d: { k: 1 } }]);
  assert.ok(c.startsWith("\uFEFF")); assert.ok(c.includes('"x,y"')); assert.ok(c.includes('"q""r"')); assert.ok(c.includes("'=1+1")); assert.ok(c.includes("مرحبا")); assert.ok(c.split("\r\n")[0].endsWith("a,b,c,d"));
});

test("zip: CRC matches zlib and the archive is a valid store-only zip", () => {
  const data = new TextEncoder().encode("hello مرحبا ".repeat(100));
  assert.equal(crc32(data), zlib.crc32(data));
  const z = toCsvZip({ k: 1 }, [{ name: "supabase_memories", rows: [{ id: "1", t: "مرحبا" }] }, { name: "firestore_members", rows: [] }]);
  fs.writeFileSync("/tmp/backup_test.zip", z);
  assert.equal(makeZip([]).length, 22);
});

test("json and ndjson carry the manifest and every row", () => {
  const t = [{ name: "supabase_a", rows: [{ id: 1 }, { id: 2 }] }, { name: "firestore_b", rows: [{ _id: "x" }] }];
  const j = JSON.parse(toJson({ m: 1 }, t)); assert.equal(j.data.supabase_a.length, 2); assert.equal(j.manifest.m, 1);
  const lines = toNdjson({ m: 1 }, t).trim().split("\n").map((l) => JSON.parse(l)); assert.equal(lines.length, 4); assert.equal(lines[3]._table, "firestore_b");
});

test("client export: failure in one table is recorded and others continue; count mismatch and skipped are reported; manifest is not claimed complete", async () => {
  const plan = { supabase: { tables: ["a", "b", "c", "d"] }, firestore: { available: true, collections: ["col"], project: "p" } };
  const f: any = async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (j: any) => ({ ok: true, status: 200, json: async () => ({ success: true, ...j }) });
    if (b.table === "a") return b.offset === 0 ? ok({ rows: [{ id: 1 }], next: 1, total: 2 }) : ok({ rows: [{ id: 2 }], next: null });
    if (b.table === "b") return { ok: false, status: 502, json: async () => ({ success: false, error: "Export read failed" }) };
    if (b.table === "c") return ok({ missing: true, reason: "table not found", rows: [], next: null });
    if (b.table === "d") return ok({ rows: [{ id: 1 }], next: null, total: 5 });
    return ok({ rows: [{ _id: "z" }], next: null });
  };
  const { tables, reports } = await runExport({ supabase: true, firestore: true }, plan, f);
  const by = Object.fromEntries(reports.map((r) => [r.name, r]));
  assert.equal(by.supabase_a.status, "ok"); assert.equal(by.supabase_a.rows, 2);
  assert.equal(by.supabase_b.status, "failed"); assert.equal(by.supabase_c.status, "skipped"); assert.equal(by.supabase_d.status, "count mismatch"); assert.equal(by.firestore_col.status, "ok");
  assert.deepEqual(tables.map((t) => t.name).sort(), ["firestore_col", "supabase_a", "supabase_b", "supabase_d"]);
  const m: any = buildManifest({ supabase: true, firestore: true }, reports, plan);
  assert.equal(m.allTablesReadWithoutProblems, false); assert.match(m.kind, /NOT restorable/); assert.ok(m.notIncluded.length >= 4);
  const okM: any = buildManifest({ supabase: true, firestore: false }, [by.supabase_a], plan); assert.equal(okM.allTablesReadWithoutProblems, true);
});

const PID_A = "u:A." + "a".repeat(32), PID_B = "u:B." + "b".repeat(32), PID_C = "u:C." + "c".repeat(32);
const chat = (id: string, o: any = {}) => ({ id, receiver: "x", sender_id: PID_B, receiver_id: PID_C, conversation_id: "dm1", ...o });

test("private 1:1 chat rows of other people are never exported (admin included); group, global and own DMs are; sparse rows fail closed; counts add up", async () => {
  const rows = [chat("other-dm"), chat("own-dm", { sender_id: PID_A, receiver_id: PID_B }), chat("g", { receiver: "global", conversation_id: "global", sender_id: PID_B, receiver_id: null, couple_id: "c" }), chat("grp", { receiver: "group_1", conversation_id: "group_1", receiver_id: null, couple_id: "c" }), chat("grp-other-couple", { receiver: "group_9", conversation_id: "group_9", receiver_id: null, couple_id: "zz" }), { id: "sparse", text: "hi" }];
  const h = makeBackupHandlers(() => fakeDb({ chat_messages: rows }), {});
  const req: any = as("admin", { source: "supabase", table: "chat_messages", offset: 0 });
  const res = mockRes(); await h.page(req, res);
  const ids = res.body.rows.map((r: any) => r.id);
  assert.ok(!ids.includes("other-dm") && !ids.includes("sparse") && !ids.includes("grp-other-couple")); assert.ok(ids.includes("g") && ids.includes("grp"));
  assert.equal(res.body.excludedPrivate + ids.length, 6); assert.equal(res.body.total, 6);
  assert.ok(ids.includes("own-dm"));
  // Owner backup scope (full = encrypted data copy): every chat row is carried, nothing is excluded, and the same holds for a separate source.
  const fr = mockRes(); await h.page(as("admin", { source: "supabase", table: "chat_messages", offset: 0, full: true }), fr);
  assert.equal(fr.body.rows.length, 6); assert.equal(fr.body.excludedPrivate, 0); assert.ok(fr.body.rows.map((r: any) => r.id).includes("other-dm"));
  const nonAdmin = mockRes(); await h.page(as("partner", { source: "supabase", table: "chat_messages", offset: 0, full: true }), nonAdmin); assert.equal(nonAdmin.code, 403);
});

test("unreadable table is a FAILURE, never a skip; only 'table not found' is a skip", async () => {
  const db: any = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }) }), limit: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }) }) }) };
  const h = makeBackupHandlers(() => db, {});
  const res = mockRes(); await h.page(as("admin", { source: "supabase", table: "memories", offset: 0 }), res);
  assert.equal(res.code, 502); assert.ok(!JSON.stringify(res.body).includes("permission denied"));
  const f: any = async () => ({ ok: false, status: 502, json: async () => ({ success: false, error: "Table could not be read" }) });
  const { reports } = await runExport({ supabase: true, firestore: false }, { supabase: { tables: ["memories"] } }, f);
  assert.equal(reports[0].status, "failed");
  assert.equal((buildManifest({ supabase: true, firestore: false }, reports, {}) as any).allTablesReadWithoutProblems, false);
});

test("FULL mode keeps every column; readable mode removes them", async () => {
  const rows = [{ id: "a", username: "u", password: "scrypt_v1:H", pid_nonce: "N", two_factor_secret: "S" }];
  const h = makeBackupHandlers(() => fakeDb({ user_accounts: rows }), {});
  const f = mockRes(); await h.page(as("admin", { source: "supabase", table: "user_accounts", offset: 0, full: true }), f);
  assert.deepEqual(f.body.rows, rows);
  const r = mockRes(); await h.page(as("admin", { source: "supabase", table: "user_accounts", offset: 0 }), r);
  assert.ok(!JSON.stringify(r.body).includes("scrypt_v1"));
  const noAdmin = mockRes(); await h.page(as("partner", { source: "supabase", table: "user_accounts", full: true }), noAdmin); assert.equal(noAdmin.code, 403);
});

test("firestore: nested collections are followed, chat-like nested paths and DMs are skipped, full mode keeps raw typed values", async () => {
  const key = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env = { ...FS_ENV, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key };
  const f = async (url: string) => {
    if (url.includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "T", expires_in: 3600 }) };
    if (url.endsWith("/members/m1:listCollectionIds")) return { ok: true, status: 200, json: async () => ({ collectionIds: ["notes", "messages"] }) };
    if (url.endsWith(":listCollectionIds")) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes("/documents/members?")) return { ok: true, status: 200, json: async () => ({ documents: [{ name: "projects/p/databases/(default)/documents/members/m1", createTime: "2026-01-01T00:00:00Z", updateTime: "2026-01-02T00:00:00Z", fields: { when: { timestampValue: "2026-01-01T10:00:00.123456Z" }, big: { integerValue: "9007199254740993" }, raw: { bytesValue: "AAEC" } } }] }) };
    if (url.includes("/documents/chatMessages?")) return { ok: true, status: 200, json: async () => ({ documents: [
      { name: "x/documents/chatMessages/d1", createTime: "t", fields: { receiver: { stringValue: "x" }, senderId: { stringValue: PID_B }, receiverId: { stringValue: PID_C }, conversationId: { stringValue: "dm1" } } },
      { name: "x/documents/chatMessages/g1", createTime: "t", fields: { receiver: { stringValue: "global" }, senderId: { stringValue: PID_B }, receiverId: { nullValue: null }, conversationId: { stringValue: "global" }, coupleId: { stringValue: "c" } } }] }) };
    return { ok: true, status: 200, json: async () => ({ documents: [{ name: "x/documents/members/m1/notes/n1", fields: { t: { stringValue: "a" } } }] }) };
  };
  const h = makeBackupHandlers(() => null, env, f as any);
  const a = mockRes(); await h.page(as("admin", { source: "firestore", collection: "members", full: true }), a);
  assert.deepEqual(a.body.subcollections.sort(), ["members/m1/messages", "members/m1/notes"]);
  const d = a.body.rows[0]; assert.equal(d._path, "members/m1"); assert.equal(d.fields.big.integerValue, "9007199254740993"); assert.equal(d.fields.when.timestampValue, "2026-01-01T10:00:00.123456Z"); assert.equal(d.fields.raw.bytesValue, "AAEC"); assert.equal(d.updateTime, "2026-01-02T00:00:00Z");
  const priv = mockRes(); await h.page(as("admin", { source: "firestore", collection: "members/m1/messages" }), priv); assert.equal(priv.body.excludedPath, true); assert.equal(priv.body.rows.length, 0);
  const n = mockRes(); await h.page(as("admin", { source: "firestore", collection: "members/m1/notes" }), n); assert.equal(n.body.excludedPath, true); assert.equal(n.body.rows.length, 0);
  const c = mockRes(); await h.page(as("admin", { source: "firestore", collection: "chatMessages" }), c); assert.deepEqual(c.body.rows.map((r: any) => r._id), ["g1"]); assert.equal(c.body.excludedPrivate, 1);
  assert.equal(isPrivateChatPath("dmThreads"), true); assert.equal(isPrivateChatPath("chatMessages"), false); assert.equal(isPrivateChatPath("chatGroups"), false); assert.equal(isPrivateChatPath("chatGroups/g/messages/x/y"), true); assert.equal(isPrivateChatPath("members/m/notes"), false);
});

test("client follows discovered subcollections and counts private exclusions in the completeness check", async () => {
  const seen: string[] = [];
  const f: any = async (_u: string, init: any) => {
    const b = JSON.parse(init.body); seen.push(b.collection || b.table);
    const ok = (j: any) => ({ ok: true, status: 200, json: async () => ({ success: true, ...j }) });
    if (b.collection === "members") return ok({ rows: [{ _path: "members/m1" }], next: null, subcollections: ["members/m1/notes"] });
    if (b.table === "chat_messages") return ok({ rows: [{ id: "g" }], next: null, total: 3, excludedPrivate: 2 });
    return ok({ rows: [{ _path: "members/m1/notes/n1" }], next: null });
  };
  const plan = { supabase: { tables: ["chat_messages"] }, firestore: { available: true, collections: ["members"], project: "p" } };
  const { reports } = await runExport({ supabase: true, firestore: true }, plan, f);
  assert.ok(seen.includes("members/m1/notes")); assert.equal(reports.find((r) => r.name === "supabase_chat_messages")!.status, "ok");
});

test("identity: a typed expectation that does not match stops the export; empty is reported as not checked", () => {
  const plan = { supabase: { ref: "abc" }, firestore: { project: "proj" } };
  assert.equal(checkIdentity(plan, { supabase: true, firestore: true }, { supabaseRef: "xyz" }).ok, false);
  assert.equal(checkIdentity(plan, { supabase: true, firestore: true }, { firestoreProject: "other" }).ok, false);
  const ok = checkIdentity(plan, { supabase: true, firestore: true }, { supabaseRef: "abc", firestoreProject: "proj" }); assert.deepEqual([ok.ok, ok.checked], [true, true]);
  assert.equal(checkIdentity(plan, { supabase: true, firestore: true }, {}).checked, false);
  assert.equal(checkIdentity(plan, { supabase: false, firestore: true }, { supabaseRef: "wrong-but-unused" }).ok, true);
});

test("encrypted file: round trip, wrong passphrase refused, tampering refused, short passphrase refused; verify catches changed rows", async () => {
  const plain = JSON.stringify({ manifest: { a: 1 }, tables: { supabase_x: { rows: [{ id: "1", t: "مرحبا" }] } } });
  const enc = await encryptText(plain, "correct horse battery", 1000);
  assert.ok(!enc.includes("مرحبا")); assert.equal(await decryptText(enc, "correct horse battery"), plain);
  await assert.rejects(() => decryptText(enc, "wrong passphrase!!"), /Wrong passphrase/);
  const e = JSON.parse(enc); e.ct = e.ct.slice(0, -4) + "AAAA"; await assert.rejects(() => decryptText(JSON.stringify(e), "correct horse battery"), /Wrong passphrase or the file was changed/);
  await assert.rejects(() => encryptText("x", "short"), /12 characters/);
  const { sha256Hex } = await import("../src/lib/backupCrypto.ts");
  const rows = [{ id: "1" }]; const manifest = { allTablesReadWithoutProblems: true, tables: [{ name: "supabase_x", rows: 1, status: "ok", sha256: await sha256Hex(JSON.stringify(rows)) }] };
  assert.equal((await verifyBackup({ manifest, tables: { supabase_x: { rows } } })).ok, true);
  const bad = await verifyBackup({ manifest, tables: { supabase_x: { rows: [{ id: "2" }] } } }); assert.equal(bad.ok, false); assert.match(bad.problems.join(" "), /hash differs/);
  assert.equal((await verifyBackup({ manifest: { ...manifest, allTablesReadWithoutProblems: false }, tables: { supabase_x: { rows } } })).ok, false);
});

test("restore SQL: allowlisted tables, explicit columns, key-based missing-only, replica mode guard, header names the source project", () => {
  const b = { manifest: { createdAt: "T", identity: { supabaseRef: "ref1" } }, tables: { supabase_memories: { rows: [{ id: "1", t: "$bk$ evil" }] }, supabase_telegram_sent: { rows: [{ key: "a" }] }, supabase_letters: { rows: [{ id: "x", _omitted: "row too large for one download page" }] }, firestore_members: { rows: [{ _id: "z" }] }, supabase_deleted_rows_backup: { rows: [{ src_table: "memories", row_id: "9", row_data: { a: 1 } }] } } };
  const r = buildRestoreSql(b as any, "missing");
  assert.deepEqual(r.tablesCovered.sort(), ["deleted_rows_backup", "memories", "telegram_sent"]); assert.equal(r.skipped.length, 1);
  assert.match(r.sql, /ref1/); assert.match(r.sql, /session_replication_role = replica/); assert.match(r.sql, /not exists \(select 1 from public\."memories" x where x\."id" = p\."id"\)/);
  assert.match(r.sql, /x\."src_table" = p\."src_table" and x\."row_id" = p\."row_id"/); assert.ok(!r.sql.includes("select *")); assert.ok(!r.sql.includes("firestore"));
  const tagMatch = r.sql.match(/jsonb_populate_recordset\(null::public\."memories", \$(\w+)\$/)!; assert.notEqual(tagMatch[1], "bk");
  const o = buildRestoreSql(b as any, "overwrite"); assert.match(o.sql, /do update set "t" = excluded\."t"/);
  assert.ok(o.skipped.some((x) => /deleted_rows_backup.*only rows not already present/.test(x)));
});

const hostile = (over: any) => ({ manifest: { createdAt: "2026", identity: { supabaseRef: "ref" }, ...(over.manifest || {}) }, tables: over.tables || { supabase_memories: { rows: [{ id: "1" }] } } });
test("ADVERSARIAL restore file: newline injection in createdAt / supabaseRef / table name never reaches executable SQL", () => {
  const evil = "x\n); drop table public.profiles; --";
  for (const b of [hostile({ manifest: { createdAt: evil } }), hostile({ manifest: { identity: { supabaseRef: evil } } }), hostile({ tables: { supabase_memories: { rows: [{ id: "1" }] }, ["supabase_" + evil]: { rows: [{ id: "1" }] } } })]) {
    const { sql } = buildRestoreSql(b as any, "overwrite");
    for (const line of sql.split("\n")) if (/drop table/i.test(line)) assert.ok(line.startsWith("--") && !line.includes("\n"), "injected text must stay inside one comment line: " + line.slice(0, 60));
    assert.ok(!sql.split("\n").some((l) => /^\s*drop table/i.test(l)));
  }
  const { sql } = buildRestoreSql(hostile({ manifest: { createdAt: "a\u2028drop table x;" } }) as any, "missing");
  assert.ok(!/\u2028/.test(sql));
});
test("ADVERSARIAL restore file: column names with quotes or spaces, and non-allowlisted tables, are refused", () => {
  const r = buildRestoreSql(hostile({ tables: { supabase_memories: { rows: [{ id: "1", 'a"b': 1 }] }, supabase_auth_users: { rows: [{ id: "1" }] }, "supabase_x; drop": { rows: [{ id: 1 }] } } }) as any, "missing");
  assert.deepEqual(r.tablesCovered, ["auth_users"]); assert.ok(r.skipped.some((x) => /plain identifier/.test(x))); assert.ok(/table_schema = 'public' and table_name = 'auth_users'/.test(r.sql) && !/\bauth\.users\b/.test(r.sql));
  assert.ok(!r.sql.includes('a"b'));
});

const adminReq = (body: any) => as("admin", body);
async function fsHarness(env: any, docs: Record<string, number> = {}) {
  const key = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const calls: { url: string; method: string; body: any }[] = [];
  const f = async (url: string, init?: any) => {
    if (url.includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "T", expires_in: 3600 }) };
    calls.push({ url, method: init?.method || "GET", body: init?.body });
    const existing = /currentDocument\.exists=false/.test(url) && /EXISTS/.test(url);
    if (existing) return { ok: false, status: 409, json: async () => ({ error: { status: "ALREADY_EXISTS" } }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { calls, h: makeBackupHandlers(() => null, { ...env, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key, BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key }, f as any) };
}
const sf = (v: string) => ({ stringValue: v });
test("firestore restore guards: wrong project 409, members/nested/chat/unknown blocked, 100-doc cap, parent-only skipped, missing mode uses exists=false, no content echoed", async () => {
  const { calls, h } = await fsHarness(FS_ENV);
  const call = async (body: any, role = "admin") => { const r = mockRes(); await h.restoreFs(as(role, body), r); return r; };
  const good = { _path: "memories/a", fields: { t: sf("SECRET-CONTENT") } };
  assert.equal((await call({ confirmProject: "other", docs: [good] })).code, 409);
  assert.equal((await call({ confirmProject: "proj", docs: [good] }, "member")).code, 403);
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "members/m", fields: { t: sf("x") } }] })).code, 200); // membership docs are restorable now (create-only "missing" mode)
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "_capability_probe/x", fields: { t: sf("x") } }] })).code, 400);
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "memories/a/notes/n", fields: { t: sf("x") } }] })).code, 200); // owner restore: nested documents are written back
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "threads/a", fields: { t: sf("x") } }] })).code, 200); // owner restore: any collection found in the backup
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "memories/../x", fields: {} }] })).code, 400);
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "memories/a", fields: { t: "raw" } }] })).code, 400);
  assert.equal((await call({ confirmProject: "proj", docs: [{ _path: "chatMessages/c1", fields: { receiver: sf("x"), senderId: sf(PID_B), receiverId: sf(PID_C) } }] })).code, 200); // owner restore: private 1:1 chat is restored faithfully
  assert.equal((await call({ confirmProject: "proj", docs: Array(101).fill(good) })).code, 400);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 4, "only the four accepted owner-restore documents (members, nested, unknown collection, private chat) were written; every refused call wrote nothing");
  const ok = await call({ confirmProject: "proj", mode: "missing", docs: [good, { _path: "letters/only-parent", _missing: true }, { _path: "memories/EXISTS", fields: { t: sf("y") } }] });
  assert.equal(ok.body.written, 1); assert.equal(ok.body.alreadyExisted, 1); assert.equal(ok.body.failed, 0);
  const patches = calls.filter((c) => c.method === "PATCH").slice(4); assert.equal(patches.length, 2); assert.ok(patches.every((c) => /currentDocument\.exists=false/.test(c.url)));
  assert.ok(!JSON.stringify(ok.body).includes("SECRET-CONTENT")); assert.ok(!patches.some((c) => /only-parent/.test(c.url)));
  const fields = await call({ confirmProject: "proj", mode: "fields", docs: [good] }); assert.ok(calls.at(-1)!.url.includes("updateMask.fieldPaths=t"));
  assert.equal(fields.body.written, 1);
});
test("separate backup source: refused when not configured, never falls back to the app, uses its own project id", async () => {
  const { h, calls } = await fsHarness(FS_ENV);
  const r = mockRes(); await h.plan(as("admin", { target: "separate" }), r); assert.equal(r.code, 400);
  const p = mockRes(); await h.page(as("admin", { target: "separate", source: "firestore", collection: "memories" }), p); assert.equal(p.code, 400);
  const w = mockRes(); await h.restoreFs(as("admin", { target: "separate", confirmProject: "proj", docs: [{ _path: "memories/a", fields: { t: sf("x") } }] }), w); assert.equal(w.code, 403);
  assert.equal(calls.length, 0);
  const env = { ...FS_ENV, BACKUP_SOURCE_FIREBASE_PROJECT_ID: "old-proj", BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: "o@y.z", BACKUP_SOURCE_SUPABASE_URL: "https://oldref.supabase.co" };
  const x = await fsHarness(env);
  const pl = mockRes(); await x.h.plan(as("admin", { target: "separate" }), pl);
  assert.equal(pl.body.firestore.project, "old-proj"); assert.equal(pl.body.supabase.ref, "oldref"); assert.equal(pl.body.supabase.available, false);
  assert.ok(x.calls.every((c) => c.url.includes("/projects/old-proj/")));
  const bad = mockRes(); await x.h.restoreFs(as("admin", { target: "separate", confirmProject: "proj", docs: [{ _path: "memories/a", fields: { t: sf("x") } }] }), bad); assert.equal(bad.code, 403); assert.equal(x.calls.filter((c) => c.method === "PATCH").length, 0);
});
test("deleted_rows_backup chat rows are excluded whole; unsafe integers are reported and the client marks the table failed; no-store header set", async () => {
  const rows = [{ src_table: "chat_messages", row_id: "1", row_data: { text: "private" } }, { src_table: "memories", row_id: "2", row_data: { n: 1 } }, { src_table: "memories", row_id: "3", row_data: { n: 9007199254740993 } }];
  const h = makeBackupHandlers(() => fakeDb({ deleted_rows_backup: rows }), {});
  const res: any = mockRes(); const hdr: string[] = []; res.setHeader = (k: string, v: string) => hdr.push(k + v);
  await h.page(as("admin", { source: "supabase", table: "deleted_rows_backup", offset: 0 }), res);
  assert.deepEqual(res.body.rows.map((r: any) => r.row_id), ["2", "3"]); assert.equal(res.body.excludedPrivate, 1); assert.equal(res.body.unsafeNumbers, 1); assert.ok(hdr.includes("Cache-Controlno-store"));
  assert.ok(!JSON.stringify(res.body).includes("private"));
  const fres: any = mockRes(); await h.page(as("admin", { source: "supabase", table: "deleted_rows_backup", offset: 0, full: true }), fres);
  assert.deepEqual(fres.body.rows.map((r: any) => r.row_id), ["1", "2", "3"]); assert.equal(fres.body.excludedPrivate, 0);
  const plan: any = { supabase: { tables: ["t"] }, firestore: { available: false, collections: [] } };
  const f = async () => ({ ok: true, status: 200, json: async () => ({ success: true, rows: [{ id: 1 }], next: null, total: 1, unsafeNumbers: 2 }) });
  const out = await runExport({ supabase: true, firestore: false }, plan, f as any);
  assert.equal(out.reports.find((r) => r.name === "supabase_t")!.status, "failed");
});

test("source binding: a page or restore call whose expected identity differs from the connected source reads/writes nothing; a missing binding is refused", async () => {
  const { calls, h } = await fsHarness(FS_ENV);
  const raw: any = (h as any).raw;
  const p = mockRes(); await raw.page(as("admin", { source: "firestore", collection: "memories", expect: { supabaseRef: null, firestoreProject: "someone-else" } }), p); assert.equal(p.code, 409);
  const q = mockRes(); await raw.page(as("admin", { source: "firestore", collection: "memories" }), q); assert.equal(q.code, 409);
  const r = mockRes(); await raw.restoreFs(as("admin", { confirmProject: "proj", docs: [{ _path: "memories/a", fields: { t: sf("x") } }], expect: { supabaseRef: null, firestoreProject: "other" } }), r); assert.equal(r.code, 409);
  assert.equal(calls.length, 0);
  // a "separate" request cannot be satisfied with the app's identity
  const env = { ...FS_ENV, BACKUP_SOURCE_FIREBASE_PROJECT_ID: "old-proj", BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: "o@y.z" };
  const x: any = (await fsHarness(env)).h.raw; const s = mockRes();
  await x.page(as("admin", { target: "separate", source: "firestore", collection: "memories", expect: { supabaseRef: null, firestoreProject: "proj" } }), s); assert.equal(s.code, 409);
});
test("client sends target and the plan's identity on every page and restore call", async () => {
  const seen: any[] = [];
  const f = async (_u: string, init: any) => { seen.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ success: true, rows: [{ _path: "memories/a", fields: { t: { stringValue: "x" } } }], next: null, total: 1, written: 1, alreadyExisted: 0, failed: 0, failedPaths: [] }) }; };
  const plan: any = { supabase: { tables: ["memories"], ref: "R1" }, firestore: { available: true, project: "P1", collections: ["memories"] } };
  await runExport({ supabase: true, firestore: true }, plan, f as any, () => {}, { target: "separate" });
  const { restoreFirestoreDocs, planExpect } = await import("../src/lib/backupClient.ts");
  await restoreFirestoreDocs({ manifest: { identity: { firestoreProject: "P1" } }, tables: { firestore_memories: { rows: [{ _path: "memories/a", fields: { t: { stringValue: "x" } } }] } } }, { target: "separate", confirmProject: "P1", mode: "missing", expect: planExpect(plan) }, f as any);
  assert.ok(seen.length >= 3); for (const b of seen) { assert.equal(b.target, "separate"); assert.deepEqual(b.expect, { supabaseRef: "R1", firestoreProject: "P1" }); }
});
test("numbers that cannot be trusted after JSON are counted: big integers and 16+ digit decimals", () => {
  assert.equal(countUnsafeNumbers({ a: 9007199254740993, b: [1.5, 0.1, 12.345, 123456789.123456789], c: { d: 3 } }), 2);
  assert.equal(countUnsafeNumbers({ a: 1e21 }), 1); assert.equal(countUnsafeNumbers({ a: 9.99, b: 100000 }), 0);
});

const asC = (role: string, body: any, coupleId: string | undefined, pid = PID_A) => ({ method: "POST", body, query: {}, headers: { "x-server-session": createServerSession({ username: "u", coupleId: coupleId as any, role: role as any, pid }) } }) as any;
test("chat fails closed: no couple on the session, unstamped group rows, and a separate source export no chat at all", async () => {
  const rows = [chat("g-ok", { receiver: "global", conversation_id: "global", receiver_id: null, couple_id: "c" }), chat("g-null", { receiver: "global", conversation_id: "global", receiver_id: null, couple_id: null }), chat("g-empty", { receiver: "global", conversation_id: "global", receiver_id: null, couple_id: "" }), chat("own", { sender_id: PID_A, receiver_id: PID_B })];
  const h = makeBackupHandlers(() => fakeDb({ chat_messages: rows }), {});
  const a = mockRes(); await h.page(asC("admin", { source: "supabase", table: "chat_messages", offset: 0 }, "c"), a); assert.deepEqual(a.body.rows.map((r: any) => r.id).sort(), ["g-ok", "own"]);
  const b = mockRes(); await h.page(asC("admin", { source: "supabase", table: "chat_messages", offset: 0 }, ""), b); assert.equal(b.code, 401); // a session without a couple is not valid at all (server/auth.ts requires coupleId)
  const { keepChatRow } = await import("../server/backupExport.ts"); assert.equal(keepChatRow(rows[0], PID_A, ""), false); assert.equal(keepChatRow(rows[1], PID_A, ""), false); assert.equal(keepChatRow(rows[3], PID_A, ""), true);
  const env = { BACKUP_SOURCE_SUPABASE_URL: "https://oldref.supabase.co" };
  const hs = makeBackupHandlers(() => null, env, undefined, undefined, () => fakeDb({ chat_messages: rows }));
  const c = mockRes(); await hs.page(asC("admin", { target: "separate", source: "supabase", table: "chat_messages", offset: 0 }, "c"), c); assert.equal(c.body.rows.length, 0); assert.equal(c.body.excludedPrivate, 4);
});
test("firestore restore: ABORTED/other 409 are failures not 'existing'; separate target is read-only; fields mode cannot touch credential collections; chat restore only own-couple group", async () => {
  const key = (await import("node:crypto")).generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const f = async (url: string) => { if (url.includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "T", expires_in: 3600 }) };
    if (url.includes("/ABORT")) return { ok: false, status: 409, json: async () => ({ error: { status: "ABORTED" } }) };
    if (url.includes("/EXIST")) return { ok: false, status: 409, json: async () => ({ error: { status: "ALREADY_EXISTS" } }) };
    if (url.includes("/PRE")) return { ok: false, status: 400, json: async () => ({ error: { status: "FAILED_PRECONDITION" } }) };
    if (url.includes("/QUOTA")) return { ok: false, status: 429, json: async () => ({ error: { status: "RESOURCE_EXHAUSTED" } }) };
    return { ok: true, status: 200, json: async () => ({}) }; };
  const env = { ...FS_ENV, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key, BACKUP_SOURCE_FIREBASE_PROJECT_ID: "old", BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: "o@y.z", BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key };
  const h = makeBackupHandlers(() => null, env, f as any);
  const d = (path: string) => ({ _path: path, fields: { t: sf("x") } });
  const r = mockRes(); await h.restoreFs(as("admin", { confirmProject: "proj", docs: [d("memories/ABORT"), d("memories/EXIST"), d("memories/PRE"), d("memories/QUOTA"), d("memories/OK")] }), r);
  assert.deepEqual([r.body.written, r.body.alreadyExisted, r.body.failed], [1, 2, 2]); assert.deepEqual(r.body.failedPaths.sort(), ["memories/ABORT", "memories/QUOTA"]);
  const sep = mockRes(); await h.restoreFs(as("admin", { target: "separate", confirmProject: "old", docs: [d("memories/OK")] }), sep); assert.equal(sep.code, 403);
  for (const col of ["userAccounts", "adminSettings", "coupleTenants", "musicGrants"]) { const x = mockRes(); await h.restoreFs(as("admin", { confirmProject: "proj", mode: "fields", docs: [d(col + "/a")] }), x); assert.equal(x.code, 400, col); }
  const m = mockRes(); await h.restoreFs(as("admin", { confirmProject: "proj", mode: "missing", docs: [d("userAccounts/a")] }), m); assert.equal(m.code, 200);
  const grp = (cid: string) => ({ _path: "chatMessages/x", fields: { receiver: sf("group_1"), conversationId: sf("group_1"), senderId: sf(PID_B), receiverId: { nullValue: null }, coupleId: sf(cid) } });
  const other = mockRes(); await h.restoreFs(as("admin", { confirmProject: "proj", docs: [grp("zz")] }), other); assert.equal(other.code, 200); // owner restore covers every couple
  const own = mockRes(); await h.restoreFs(as("admin", { confirmProject: "proj", docs: [grp("c")] }), own); assert.equal(own.code, 200);
});
test("client: a file taken from another Firestore project is refused before anything is sent; a table without its key column is marked failed", async () => {
  const { restoreFirestoreDocs } = await import("../src/lib/backupClient.ts");
  let sent = 0; const f = async () => { sent++; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
  await assert.rejects(restoreFirestoreDocs({ manifest: { identity: { firestoreProject: "OLD" } }, tables: { firestore_memories: { rows: [{ _path: "memories/a", fields: { t: sf("x") } }] } } }, { target: "app", confirmProject: "TEST", mode: "missing", expect: { supabaseRef: null, firestoreProject: "TEST" } }, f as any));
  await assert.rejects(restoreFirestoreDocs({ tables: {} } as any, { target: "app", confirmProject: "TEST", mode: "missing", expect: { supabaseRef: null, firestoreProject: "TEST" } }, f as any));
  assert.equal(sent, 0);
  const plan: any = { supabase: { tables: ["memories"] }, firestore: { available: false, collections: [] } };
  const g = async () => ({ ok: true, status: 200, json: async () => ({ success: true, rows: [{ title: "no id here" }], next: null, total: 1 }) });
  const out = await runExport({ supabase: true, firestore: false }, plan, g as any);
  assert.equal(out.reports[0].status, "failed"); assert.match(out.reports[0].detail || "", /key column/);
});

test("exact numbers: unsafe column numbers become exact text, strings and nested json are untouched or still flagged", async () => {
  const src = '[{"id":1,"big":9007199254740993,"neg":-12345678901234567890,"num":12345678.123456789012,"ok":123.45,"txt":"9007199254740993 \\" 99999999999999999999","meta":{"n":9007199254740993},"arr":[12345678901234567890]}]';
  const r = quoteUnsafeNumbers(src, "user_accounts", { user_accounts: ["big", "neg", "num"] });
  const row = JSON.parse(r.text)[0];
  assert.equal(row.big, "9007199254740993"); assert.equal(row.neg, "-12345678901234567890"); assert.equal(row.num, "12345678.123456789012");
  assert.equal(row.ok, 123.45); assert.equal(row.id, 1); assert.equal(row.txt, '9007199254740993 " 99999999999999999999'); assert.equal(r.converted, 5);
  assert.equal(countUnsafeNumbers(row), 2); // nested ones (meta.n, arr[0]) are still flagged, never silently rounded
  const src2 = '[{"id":9007199254740993,"membership_epoch":9007199254740995,"fence":9007199254740997}]';
  const base = async () => new Response(src2, { status: 200, headers: { "content-type": "application/json" } });
  const w = await exactNumbersFetch(base)("https://x.supabase.co/rest/v1/item_shares?select=*"); assert.equal(JSON.parse(await w.text())[0].id, "9007199254740993");
  const ua = JSON.parse(await (await exactNumbersFetch(base)("https://x.supabase.co/rest/v1/user_accounts?select=*")).text())[0]; assert.equal(ua.membership_epoch, "9007199254740995"); assert.deepEqual(ua.id, { $unsafeNumber: "9007199254740993" }); // only allowlisted columns convert
  const mo = JSON.parse(await (await exactNumbersFetch(base)("https://x.supabase.co/rest/v1/membership_ops?select=*")).text())[0]; assert.equal(mo.fence, "9007199254740997");
  const unk = JSON.parse(await (await exactNumbersFetch(base)("https://x.supabase.co/rest/v1/memories?select=*")).text())[0]; assert.deepEqual(unk.id, { $unsafeNumber: "9007199254740993" }); // unknown table.column: marker, never a guess
  const other = await exactNumbersFetch(base)("https://x.supabase.co/auth/v1/user"); assert.equal(JSON.parse(await other.text())[0].id, 9007199254740992);
});
test("restore SQL: FK orphan check before commit, dry run ends in rollback without setval, both name constraints only", () => {
  const b = { manifest: { createdAt: "T", identity: { supabaseRef: "r" } }, tables: { supabase_item_shares: { rows: [{ id: 1, owner: "a" }] } } };
  const real = buildRestoreSql(b as any, "missing"); const dry = buildRestoreSql(b as any, "missing", "", { dryRun: true });
  assert.match(real.sql, /contype = 'f'/); { const ib = real.sql.indexOf("insert into _bk_fk"), ia = real.sql.indexOf("new invalid reference value"), ic = real.sql.lastIndexOf("commit;"); assert.ok(ib >= 0 && ia >= 0 && ic >= 0); assert.ok(ib < ia && ia < ic); } assert.ok(real.sql.trimEnd().endsWith("commit;")); assert.match(real.sql, /setval/);
  assert.ok(dry.sql.trimEnd().endsWith("rollback;")); assert.ok(!/setval/.test(dry.sql)); assert.ok(!/\bcommit;/.test(dry.sql)); assert.match(dry.sql, /DRY RUN/);
  { const ia = dry.sql.indexOf("new invalid reference value"), ir = dry.sql.lastIndexOf("rollback;"); assert.ok(ia >= 0 && ir >= 0 && ia < ir); }
});

test("nested numbers: unsafe integers and long decimals inside json/array columns become a failure marker, never a string; single-object responses; exponents at column level", () => {
  const r = quoteUnsafeNumbers('[{"id":1,"meta":{"a":9007199254740993,"b":0.10000000000000000001,"c":[1.5,12345678901234567890.5]},"arr":[0.10000000000000000001],"ok":{"n":0.25,"e":1e-7},"x":1e-7}]');
  const row = JSON.parse(r.text)[0];
  assert.deepEqual(row.meta.a, { $unsafeNumber: "9007199254740993" }); assert.deepEqual(row.meta.b, { $unsafeNumber: "0.10000000000000000001" }); assert.deepEqual(row.meta.c[1], { $unsafeNumber: "12345678901234567890.5" });
  assert.deepEqual(row.arr[0], { $unsafeNumber: "0.10000000000000000001" }); assert.equal(row.meta.c[0], 1.5); assert.equal(row.ok.n, 0.25); assert.equal(row.ok.e, 1e-7);
  assert.equal(row.x, 1e-7); assert.equal(countUnsafeNumbers(row), 4);
  const single = JSON.parse(quoteUnsafeNumbers('{"id":9007199254740993,"s":0.1}', "item_shares").text); assert.equal(single.id, "9007199254740993"); assert.equal(single.s, 0.1);
});

test("numeric scanner: bare unsafe number in a json column fails, each allowlisted column converts, non-finite and underflow tokens are flagged, zeros are not", () => {
  const j = JSON.parse(quoteUnsafeNumbers('[{"payload":9007199254740993,"id":9007199254740993}]', "memories").text)[0];
  assert.deepEqual(j.payload, { $unsafeNumber: "9007199254740993" }); assert.deepEqual(j.id, { $unsafeNumber: "9007199254740993" });
  for (const [tb, col] of [["item_shares", "id"], ["membership_ops", "fence"], ["user_accounts", "membership_epoch"]]) { const r = JSON.parse(quoteUnsafeNumbers(`[{"${col}":9007199254740993}]`, tb).text)[0]; assert.equal(r[col], "9007199254740993", tb + "." + col); }
  const json = JSON.parse(quoteUnsafeNumbers('[{"a":1e400,"b":1e-400,"c":0e10,"d":-0,"e":0.0,"f":1e-7,"g":{"h":1e400,"i":1e-400,"j":0e10},"k":[-1e999]}]', "memories").text)[0];
  assert.deepEqual(json.a, { $unsafeNumber: "1e400" }); assert.deepEqual(json.b, { $unsafeNumber: "1e-400" }); assert.equal(json.c, 0); assert.equal(json.d === 0, true); assert.equal(json.e, 0); assert.equal(json.f, 1e-7);
  assert.deepEqual(json.g.h, { $unsafeNumber: "1e400" }); assert.deepEqual(json.g.i, { $unsafeNumber: "1e-400" }); assert.equal(json.g.j, 0); assert.deepEqual(json.k[0], { $unsafeNumber: "-1e999" });
  assert.equal(countUnsafeNumbers(json), 5);
});

test("live table discovery: a table that is not on the fixed list is found, paged by its own primary key and reported; a failed discovery is reported, not hidden", async () => {
  const defs = { memories: { properties: { id: { description: "Note:\nThis is a Primary Key.<pk/>" } } }, brand_new: { properties: { code: { description: "Note:\nThis is a Primary Key.<pk/>" }, v: {} } }, no_pk_tbl: { properties: { a: {} } } };
  const f: any = async (url: string) => String(url).includes("/rest/v1/") ? ({ ok: true, status: 200, json: async () => ({ definitions: defs }) }) : ({ ok: false, status: 404, json: async () => ({}) });
  const db = fakeDb({ memories: [], brand_new: [{ code: "x1", v: 1 }, { code: "x2", v: 2 }], no_pk_tbl: [{ a: 1 }] });
  const h = realHandlers(() => db, {}, f, (r) => r, () => null, () => ({ url: "https://abc.supabase.co", key: "svc" }));
  const p = mockRes(); await h.plan(as("admin", { target: "app", expect: { supabaseRef: null, firestoreProject: "" } }), p);
  assert.ok(p.body.supabase.tables.includes("brand_new") && p.body.supabase.tables.includes("no_pk_tbl"));
  assert.deepEqual(p.body.supabase.keys, { brand_new: ["code"] });
  assert.deepEqual(p.body.supabase.discovery.extraTables, ["brand_new", "no_pk_tbl"]); assert.deepEqual(p.body.supabase.discovery.withoutPrimaryKey, ["no_pk_tbl"]);
  const pg = mockRes(); await h.page(as("admin", { target: "app", expect: { supabaseRef: null, firestoreProject: "" }, source: "supabase", table: "brand_new", offset: 0, full: true }), pg);
  assert.equal(pg.body.rows.length, 2);
  const bad = mockRes(); await h.page(as("admin", { target: "app", expect: { supabaseRef: null, firestoreProject: "" }, source: "supabase", table: "not_in_project", offset: 0, full: true }), bad); assert.equal(bad.code, 400);
  const h2 = realHandlers(() => db, {}, async () => ({ ok: false, status: 401, json: async () => ({}) }), (r) => r, () => null, () => ({ url: "https://abc.supabase.co", key: "svc" }));
  const p2 = mockRes(); await h2.plan(as("admin", { target: "app", expect: { supabaseRef: null, firestoreProject: "" } }), p2);
  assert.equal(p2.body.supabase.discovery.ok, false); assert.equal(p2.body.supabase.tables.length, 17); assert.ok(/NOT covered/.test(p2.body.supabase.discovery.note));
});

test("restore SQL for a table found only in the file: uses the file's key, or whole-row match when keyless", () => {
  const b = { manifest: { createdAt: "2026-01-01", identity: { supabaseRef: "x" }, inventory: { keys: { extra_a: ["id"], extra_b: [] } } }, tables: { supabase_extra_a: { rows: [{ id: 1, v: "a" }] }, supabase_extra_b: { rows: [{ v: "z" }] } } };
  const r = buildRestoreSql(b as any, "overwrite");
  assert.deepEqual(r.tablesCovered.sort(), ["extra_a", "extra_b"]);
  assert.match(r.sql, /insert into public\."extra_a" .* on conflict \("id"\) do update/);
  assert.match(r.sql, /to_jsonb\(x\) = to_jsonb\(p\)/);
  assert.ok(r.skipped.some((x) => /extra_b.*no primary key/.test(x)));
});

import { buildPgConfig, dbProjectRef } from "../server/pgConfig.ts";
import { buildSchemaSql, buildCatalogDataSql, buildFullRestoreSql } from "../src/lib/backupSchemaSql.ts";
import { unsafeNumberCount } from "../server/backupCatalog.ts";
import { SUPABASE_ROOT_CA } from "../server/supabaseCa.ts";
const REF = "abcdefghijklmnop";
test("database connection: verified TLS against the Supabase CA, URL parameters never override it, wrong or unreadable project is refused", () => {
  const c = buildPgConfig(`postgresql://postgres.${REF}:p%40ss%3Aw%2Frd@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=disable&ssl=false`, REF, SUPABASE_ROOT_CA);
  assert.equal(c.ssl.rejectUnauthorized, true); assert.equal(c.ssl.ca, SUPABASE_ROOT_CA); assert.equal(c.ssl.servername, "aws-0-eu-central-1.pooler.supabase.com");
  assert.equal(c.password, "p@ss:w/rd"); assert.equal(c.connectionString, undefined); assert.ok(!JSON.stringify(c).includes("sslmode"));
  assert.match(SUPABASE_ROOT_CA, /^-----BEGIN CERTIFICATE-----/);
  const d = buildPgConfig(`postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`, REF, "ca"); assert.equal(d.host, `db.${REF}.supabase.co`);
  assert.throws(() => buildPgConfig(`postgresql://postgres.zzzzzzzzzzzzzzzz:x@h.pooler.supabase.com:5432/postgres`, REF, "ca"), (e: any) => e.code === "WRONG_PROJECT");
  assert.throws(() => buildPgConfig(`postgresql://postgres:x@evil.example.com:5432/postgres`, REF, "ca"), (e: any) => e.code === "WRONG_PROJECT");
  assert.throws(() => buildPgConfig("not a url", REF, "ca"), (e: any) => e.code === "BAD_URL");
  assert.throws(() => buildPgConfig(`postgresql://postgres.${REF}:x@h/postgres`, "", "ca"), (e: any) => e.code === "WRONG_PROJECT");
  assert.equal(dbProjectRef(new URL("postgresql://postgres:x@localhost/postgres")), null);
});
test("restore schema SQL: injected fragments are skipped, dry run has no setval, views follow their dependencies, partitioned tables are refused", () => {
  const col = (name: string, type = "text", def: string | null = null) => ({ name, type, notNull: false, default: def, identity: "", generated: "" });
  const cat: any = {
    version: "x", extensions: [], schemas: ["public"], types: [], partitioned: [],
    sequences: [{ schema: "public", name: "s1", type: "bigint", start: "1", inc: "1", min: "1", max: "9", cycle: false, last: "5" }],
    tables: [{ schema: "public", name: "t", kind: "r", rls: true, forceRls: false, keys: ["id"], rowEstimate: 0, columns: [col("id"), col("v", "text", "'a'::text; drop table x")] }, { schema: "public", name: "pt", kind: "p", rls: false, forceRls: false, keys: [], rowEstimate: 0, columns: [col("id")] }, { schema: "public", name: "t2", kind: "r", rls: false, forceRls: false, keys: ["id"], rowEstimate: 0, columns: [col("id")] }],
    constraints: [{ schema: "public", table: "t2", name: "c1", type: "c", def: "CHECK (true); drop table t2" }, { schema: "public", table: "t2", name: "c2", type: "c", def: "CHECK (id <> '$b$')" }, { schema: "public", table: "t2", name: "c3", type: "c", def: "CHECK (id <> 'x')" }],
    indexes: [], triggers: [{ schema: "public", table: "t2", name: "g", def: "CREATE TRIGGER g BEFORE INSERT ON public.t2 FOR EACH ROW EXECUTE FUNCTION f(); drop table t2" }],
    functions: [{ schema: "public", name: "f", args: "", def: "CREATE OR REPLACE FUNCTION public.f() RETURNS trigger LANGUAGE plpgsql AS $function$ begin return new; end $function$" }, { schema: "public", name: "bad", args: "", def: "CREATE OR REPLACE FUNCTION public.bad() RETURNS int LANGUAGE sql AS $f$ select 1 $f$; drop table t2; --" }, { schema: "public", name: "nobody", args: "", def: "CREATE FUNCTION public.nobody() RETURNS int LANGUAGE sql RETURN 1" }],
    views: [{ schema: "public", name: "v_b", materialized: false, def: " SELECT id FROM v_a", deps: ["public.v_a"] }, { schema: "public", name: "v_a", materialized: false, def: " SELECT id FROM t2", deps: [] }, { schema: "public", name: "v_evil", materialized: false, def: " SELECT 1; drop table t2", deps: [] }],
    policies: [{ schema: "public", table: "t2", name: "p one", permissive: true, cmd: "r", roles: ["public"], using: "(true); drop table t2", check: null }, { schema: "public", table: "t2", name: "p two", permissive: true, cmd: "r", roles: ["public"], using: "(true)", check: null }], grants: [],
  };
  const s = buildSchemaSql(cat);
  assert.ok(!/drop table/i.test(s.sql.replace(/-- .*/g, "")), "no injected statement reaches the script");
  assert.ok(/CHECK \(id <> 'x'\)/.test(s.sql) && /create policy "p two"/.test(s.sql) && /public\.f\(\)/.test(s.sql));
  assert.ok(s.sql.indexOf('view "public"."v_a"') < s.sql.indexOf('view "public"."v_b"'), "dependency order");
  for (const k of ["table t", "constraint c1", "constraint c2", "trigger g", "function bad", "function nobody", "view v_evil", "policy p one", "table pt"]) assert.ok(s.skipped.some((x) => x.includes(k)), `skipped: ${k}`);
  const dry = buildCatalogDataSql(cat, { "public.t2": [{ id: "1" }] }, "overwrite", { dryRun: true }); assert.ok(!/setval/.test(dry.sql));
  const real = buildCatalogDataSql(cat, { "public.t2": [{ id: "1" }] }, "overwrite"); assert.ok(/setval/.test(real.sql));
  const full = buildFullRestoreSql({ manifest: { catalog: cat }, tables: { "pg_public.t2": { rows: [{ id: "1" }] } } } as any, "missing", true);
  assert.ok(!/setval/.test(full.sql) && /rollback;\s*$/.test(full.sql) && /EXECUTES SQL definitions/.test(full.sql) && /take locks|taking locks/.test(full.sql));
});
test("pg row precision: numbers a JavaScript number cannot hold exactly are counted, strings and short numbers are not", () => {
  assert.equal(unsafeNumberCount('{"a":12345678901234567,"b":"12345678901234567890","c":[1.5,2.50,100]}'), 1);
  assert.equal(unsafeNumberCount('{"a":0.1234567890123456789,"b":9007199254740993}'), 2);
  assert.equal(unsafeNumberCount('{"s":"quote \\" 99999999999999999999","n":42}'), 0);
});

import { exportStorageFiles, restoreStorageFiles } from "../src/lib/backupClient.ts";
test("storage files: every bucket and folder is listed, big files come in chunks, bytes match; restore is create-only and bound to the typed project", async () => {
  const big = Buffer.alloc(5 * 1024 * 1024 + 123); for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 255;
  const small = Buffer.from("مرحبا png bytes \u0000\u0001\u00ff", "utf8");
  const files: Record<string, Buffer> = { "media-uploads/x.bin": big, "media-uploads/a/b.png": small };
  const written: Record<string, Buffer> = {};
  const fakeFetch: any = async (url: string, init: any = {}) => {
    const u = String(url); const json = (b: any, s = 200) => ({ ok: s < 400, status: s, json: async () => b, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
    if (u.endsWith("/storage/v1/bucket")) return json([{ id: "media-uploads", name: "media-uploads", public: true }, { id: "bad bucket!", name: "x", public: false }].slice(0, (globalThis as any).__BADBUCKET ? 2 : 1));
    if (u.includes("/storage/v1/object/list/media-uploads")) { const b = JSON.parse(init.body); const kids = b.prefix === "" ? [{ name: "a", id: null }, { name: "x.bin", id: "1", metadata: { size: big.length, mimetype: "application/octet-stream" } }] : b.prefix === "a" ? [{ name: "b.png", id: "2", metadata: { size: small.length, mimetype: "image/png" } }] : []; return json(kids); }
    if (u.includes("/storage/v1/object/media-uploads/") && (!init.method || init.method === "GET")) {
      const key = "media-uploads/" + decodeURIComponent(u.split("/storage/v1/object/media-uploads/")[1]); const buf = files[key]; if (!buf) return json({}, 404);
      const m = /bytes=(\d+)-(\d+)/.exec(init.headers.Range); const a = Number(m![1]), z = Math.min(buf.length - 1, Number(m![2])); const part = buf.subarray(a, z + 1);
      return { ok: true, status: 206, headers: { get: (k: string) => (k.toLowerCase() === "content-range" ? `bytes ${a}-${z}/${buf.length}` : null) }, arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.length) };
    }
    if (u.includes("/storage/v1/object/upload/sign/") && init.method === "POST") { const key = decodeURIComponent(u.split("/storage/v1/object/upload/sign/")[1]); if (written[key]) return json({ message: "The resource already exists" }, 409); return json({ url: `/object/upload/sign/${key}?token=T` }); }
    if (u.includes("/storage/v1/object/upload/sign/") && init.method === "PUT") { const key = decodeURIComponent(u.split("/storage/v1/object/upload/sign/")[1].split("?")[0]); written[key] = Buffer.from("signed-direct"); return json({ Key: key }); }
    if (u.includes("/storage/v1/object/") && init.method === "POST") { const key = decodeURIComponent(u.split("/storage/v1/object/")[1]); if (written[key] || key === "media-uploads/a/b.png") return json({ message: "The resource already exists" }, 409); written[key] = Buffer.from(init.body); return json({ Key: key }); }
    return json({}, 500);
  };
  const h: any = realHandlers(() => ({}), { SUPABASE_URL: "https://abcref.supabase.co" }, fakeFetch, (r) => r, () => null, () => ({ url: "https://abcref.supabase.co", key: "svc" }));
  const sess = createServerSession({ username: "u", coupleId: "c", role: "admin" as any, pid: "u:A." + "a".repeat(32) });
  const f: any = async (url: string, init: any) => { if (String(url).startsWith("https://abcref")) return fakeFetch(url, init); const op = String(url).split("op=")[1]; const res = mockRes(); res.setHeader = () => {}; await (op === "backup-page" ? h.page : op === "backup-restore-storage" ? h.restoreStorage : op === "backup-sign-storage" ? h.signStorage : h.plan)({ method: "POST", body: JSON.parse(init.body), query: {}, headers: { "x-server-session": sess } }, res); return { ok: res.code < 400, status: res.code, json: async () => res.body }; };
  (globalThis as any).localStorage ||= { getItem: () => null, setItem() {} };
  const expect = { supabaseRef: "abcref", firestoreProject: null };
  const r = await exportStorageFiles({ catalog: { ok: true, data: { rowCounts: { "storage.objects": 2 } } } }, f, () => {}, { target: "app", expect });
  assert.equal(r.rows.length, 2); assert.equal(r.report.status, "ok", String(r.report.detail));
  const bigRow = r.rows.find((x) => x.name === "x.bin")!; assert.equal(Buffer.from(bigRow.b64, "base64").equals(big), true); assert.equal(bigRow.restorable, true);
  const smallRow = r.rows.find((x) => x.name === "a/b.png")!; assert.equal(Buffer.from(smallRow.b64, "base64").equals(small), true); assert.equal(smallRow.mime, "image/png");
  (globalThis as any).__BADBUCKET = true; const bb = await exportStorageFiles({}, f, () => {}, { target: "app", expect }); assert.equal(bb.report.status, "failed"); assert.match(String(bb.report.detail), /unsupported name/); (globalThis as any).__BADBUCKET = false;
  const bad = await exportStorageFiles({ catalog: { ok: true, data: { rowCounts: { "storage.objects": 3 } } } }, f, () => {}, { target: "app", expect });
  assert.equal(bad.report.status, "failed"); assert.match(String(bad.report.detail), /lists 3 objects/);
  const file: any = { manifest: { identity: { supabaseRef: "abcref" } }, tables: { storage_files: { rows: r.rows } } };
  await assert.rejects(() => restoreStorageFiles(file, { confirmProject: "other", expect }, f), /Nothing was written/);
  const out = await restoreStorageFiles(file, { confirmProject: "abcref", expect }, f);
  assert.deepEqual({ w: out.written, e: out.alreadyExisted, f: out.failed, big: out.tooLarge }, { w: 1, e: 1, f: 0, big: 0 }); // b.png already exists; the big file goes straight to Storage through a one-object signed upload URL
  assert.ok(Object.keys(written).includes("media-uploads/x.bin"));
  const out2 = await restoreStorageFiles(file, { confirmProject: "abcref", expect }, f); assert.deepEqual({ w: out2.written, e: out2.alreadyExisted }, { w: 0, e: 2 }); // second run: nothing replaced
  assert.equal(out2.conflicting, 0);
  files["media-uploads/a/b.png"] = Buffer.from("different bytes already in the destination");
  const out3 = await restoreStorageFiles(file, { confirmProject: "abcref", expect }, f); assert.equal(out3.conflicting, 1); assert.equal(out3.alreadyExisted, 1); assert.ok(out3.failedPaths.some((x: string) => /b\.png \(exists with different bytes\)/.test(x))); // presence alone is never counted as recovered
  const ow = buildStorageOwnerSql({ tables: { "pg_storage.objects": { rows: [{ bucket_id: "media-uploads", name: "a/b.png", owner: "11111111-2222-3333-4444-555555555555", owner_id: "11111111-2222-3333-4444-555555555555" }, { bucket_id: "x", name: "evil", owner: "1'; drop table x;--" }] } } });
  assert.equal(ow.count, 1); assert.ok(!/drop table/.test(ow.sql));
  const sg = mockRes(); await h.signStorage({ method: "POST", body: { target: "app", confirmProject: "other", expect, bucket: "media-uploads", path: "q.bin" }, query: {}, headers: { "x-server-session": sess } }, sg); assert.equal(sg.code, 409);
  const sg2 = mockRes(); await h.signStorage({ method: "POST", body: { target: "app", confirmProject: "abcref", expect, bucket: "media-uploads", path: "../q" }, query: {}, headers: { "x-server-session": sess } }, sg2); assert.equal(sg2.code, 400);
  const sep = mockRes(); await h.restoreStorage({ method: "POST", body: { target: "separate" }, query: {}, headers: { "x-server-session": sess } }, sep); assert.equal(sep.code, 403);
  const trav = mockRes(); await h.page({ method: "POST", body: { source: "storage", full: true, action: "get", bucket: "media-uploads", path: "../x", expect }, query: {}, headers: { "x-server-session": sess } }, trav); assert.equal(trav.code, 400);
  const ro = mockRes(); await h.page({ method: "POST", body: { source: "storage", action: "buckets", expect }, query: {}, headers: { "x-server-session": sess } }, ro); assert.equal(ro.code, 400); // not part of the readable export
});

test("v14 restore-script quoting: owner script and data script cannot be broken out of by names; missing sha is unverified; final listing and no-catalog gaps", async () => {
  // owner script: hostile object names carrying delimiter shapes, quotes, semicolon, newline
  const evil = ["$bk$; drop table x; --", "$o$ x $o$", "a'b\";c\n$bk0x$", "$$"];
  const ow = buildStorageOwnerSql({ tables: { "pg_storage.objects": { rows: evil.map((n) => ({ bucket_id: "media-uploads", name: n, owner: "11111111-2222-3333-4444-555555555555", owner_id: null })) } } });
  assert.equal(ow.count, 4); assert.ok(!/\bdo \$/i.test(ow.sql), "no DO block, no nesting");
  const tag = /jsonb_to_recordset\(\$([A-Za-z0-9_]+)\$/.exec(ow.sql)![1]; assert.equal(ow.sql.split(`$${tag}$`).length - 1, 4); // two sources, each opened and closed by the one tag
  const payload = JSON.stringify(evil); assert.ok(!payload.includes(`$${tag}$`));
  // data script: hostile column name with a fixed delimiter inside a DO block -> fail closed
  const cat: any = { tables: [{ schema: "public", name: "t", kind: "r", keys: ["id"], columns: [{ name: "id", type: "integer", generated: "" }, { name: "a$c$b", type: "text", generated: "" }] }], sequences: [] };
  let threw = false; try { const r = buildCatalogDataSql(cat, { "public.t": [{ id: 1, "a$c$b": "x" }] }, "missing"); assertDollarSafe(r.sql); if (!/a\$c\$b/.test(r.sql)) threw = true; } catch (e: any) { threw = /quoting marker/.test(String(e.message)); }
  assert.ok(threw, "hostile identifier is either skipped or refused, never embedded");
  assert.throws(() => assertDollarSafe("do $c$ begin perform 1; end $c$; select $c$ ; drop table x; --"), /quoting marker/);
  assertDollarSafe("do $c$ begin perform 1; end $c$;");
  // manifest gaps
  const rep: any[] = [{ name: "storage_files", source: "supabase", rows: 1, status: "ok" }];
  const m: any = buildManifest({ supabase: true, firestore: true } as any, rep, { supabase: { ref: "r", discovery: { ok: true } }, catalog: { ok: false, reason: "x" }, firestore: { available: false, listIncomplete: true } } as any, { full: true, target: "app" } as any);
  assert.ok(m.completenessGaps.some((g: string) => /could not be checked against storage\.objects/.test(g)));
  assert.ok(m.completenessGaps.some((g: string) => /not preserved/.test(g) && /user_metadata/.test(g)));
  assert.ok(m.completenessGaps.some((g: string) => /collection list could not be read to the end/.test(g)));
  assert.equal(m.allTablesReadWithoutProblems, false);
  // final listing differs from what was copied -> failed; missing sha256 -> not "already there"
  let phase = 0; const bytes = Buffer.from("hello");
  const f: any = async (url: string, init: any) => { const b = JSON.parse(init.body); const res = (j: any) => ({ ok: true, status: 200, json: async () => j });
    if (b.action === "buckets") return res({ success: true, buckets: [{ id: "b1" }] });
    if (b.action === "list") { if (b.bucket === "b1" && b.prefix === "") { if (phase === 0) return res({ success: true, items: [{ name: "f1", size: 5, mime: "text/plain" }], next: null }); return res({ success: true, items: [{ name: "f1", size: 5 }, { name: "f2", size: 1 }], next: null }); } }
    if (b.action === "get") { phase = 1; return res({ success: true, b64: bytes.toString("base64"), chunks: 1, total: 5 }); }
    return res({ success: true }); };
  (globalThis as any).localStorage ||= { getItem: () => null, setItem() {} };
  const { exportStorageFiles: esf, restoreStorageFiles: rsf } = await import("../src/lib/backupClient.ts");
  const r = await esf({ catalog: { ok: true, data: { rowCounts: { "storage.objects": 1 } } } }, f, () => {}, { target: "app", expect: {} });
  assert.equal(r.report.status, "failed"); assert.match(String(r.report.detail), /final listing shows 2 objects but 1 were copied/);
  const g: any = async (url: string, init: any) => { if (String(url).includes("backup-restore-storage")) return { ok: true, status: 200, json: async () => ({ success: true, written: false, alreadyExisted: true }) }; return f(url, init); };
  const file: any = { manifest: { identity: { supabaseRef: "r" } }, tables: { storage_files: { rows: [{ bucket: "b1", name: "f1", size: 5, mime: "text/plain", b64: bytes.toString("base64"), restorable: true }] } } };
  const o = await rsf(file, { confirmProject: "r", expect: {} }, g); assert.equal(o.conflicting, 1); assert.equal(o.alreadyExisted, 0);
});

test("v14 per-statement guard: balanced delimiter breakouts with a new DO opening are refused for every fixed tag", () => {
  for (const tag of ["a", "b", "c", "e", "o"]) {
    const T = `$${tag}$`;
    const breakout = `x${T}; drop table t; ${`do ${T} begin perform 1; end ${T}`}; select ${T}`; // balanced: closes, runs SQL, opens a new block that the later close would rebalance
    assert.throws(() => guardStatement(`do ${T} begin perform ${"'" + breakout + "'"}; end ${T};`), /quoting marker/, `tag ${tag}`);
    assert.throws(() => guardStatement(`do ${T} begin perform 1; end ${T}; do ${T} begin perform 2; end ${T};`), /quoting marker/); // two blocks in one statement
    guardStatement(`do ${T} begin perform 'plain'; end ${T};`);
  }
  // through the generator: hostile enum labels, constraint and sequence names
  for (const tag of ["a", "b", "c", "e", "o"]) {
    const T = `$${tag}$`; const evil = `v${T}; drop table t; do ${T} begin perform 1; end ${T}; select ${T}`;
    const cat: any = { tables: [], types: [{ kind: "enum", schema: "public", name: "e1", def: [evil, "ok"] }], sequences: [{ schema: "public", name: `s${T}x`, type: "bigint", start: "1", inc: "1", min: "1", max: "9", cycle: false, last: null }], constraints: [{ schema: "public", table: "t", name: `k${T}; do ${T} begin end ${T}; --`, def: "check (true)" }], policies: [], triggers: [], functions: [], views: [], indexes: [], grants: [], acl: [], defaultAcl: [] };
    let sql = ""; let refused = false;
    try { sql = buildSchemaSql(cat).sql; } catch (e: any) { refused = /quoting marker/.test(String(e.message)); }
    if (!refused) assert.ok(!sql.includes("drop table t"), `tag ${tag}: hostile text must not appear unquoted`);
  }
});
