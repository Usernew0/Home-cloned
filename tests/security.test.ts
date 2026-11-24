import assert from "node:assert/strict";
import test from "node:test";

import { createServerSession, hashPasswordScrypt, needsRehash, verifyPassword, verifyServerSession, hashPassword, getSessionSecret } from "../server/auth.ts";
import { authorizeProxy, stripColumns } from "../server/policy.ts";
import { isBlocked, recordFailure, resetAllForTests } from "../server/ratelimit.ts";
import { rolesForPath } from "../server/guards.ts";

const partner = { username: "p", coupleId: "c1", role: "partner" as const, expiresAt: 0 };
const admin = { ...partner, role: "admin" as const };
const guest = { ...partner, role: "guest" as const };

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("session secret fails closed in production", () => {
  withEnv({ NODE_ENV: "production", SERVER_SESSION_SECRET: undefined, VERCEL: undefined }, () => {
    assert.throws(() => getSessionSecret());
    assert.throws(() => createServerSession({ username: "a", coupleId: "c", role: "admin" }));
    assert.equal(verifyServerSession("x.y"), null);
  });
  withEnv({ NODE_ENV: undefined, VERCEL: "1", SERVER_SESSION_SECRET: undefined }, () => assert.throws(() => getSessionSecret()));
  withEnv({ NODE_ENV: "production", SERVER_SESSION_SECRET: "short" }, () => assert.throws(() => getSessionSecret()));
});

test("tokens signed with the old public default secret are rejected in production", () => {
  let forged = "";
  withEnv({ NODE_ENV: undefined, VERCEL: undefined, SERVER_SESSION_SECRET: undefined }, () => {
    forged = createServerSession({ username: "evil", coupleId: "c", role: "admin" });
    assert.ok(verifyServerSession(forged));
  });
  withEnv({ NODE_ENV: "production", SERVER_SESSION_SECRET: "x".repeat(40) }, () => assert.equal(verifyServerSession(forged), null));
});

test("scrypt hashes verify, are salted, and legacy hashes are flagged for upgrade", async () => {
  const a = hashPasswordScrypt("pw-1");
  const b = hashPasswordScrypt("pw-1");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("pw-1", a), true);
  assert.equal(await verifyPassword("pw-2", a), false);
  assert.equal(needsRehash(a), false);
  assert.equal(needsRehash(hashPassword("pw-1")), true);
  assert.equal(needsRehash("plain"), true);
});

test("proxy rejects unknown tables and bad actions", () => {
  assert.equal(authorizeProxy(admin, { table: "auth.users", action: "select" }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "drop" }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories; drop", action: "select" }).ok, false);
});

test("proxy blocks mass writes and ignored filter operators", () => {
  assert.equal(authorizeProxy(admin, { table: "memories", action: "delete" }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "update", data: { a: 1 }, filters: [] }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "delete", filters: [{ column: "id", operator: "neq", value: "1" }] }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "delete", filters: [{ column: "id", operator: "gt", value: "1" }] }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "delete", filters: [{ column: "id", operator: "eq", value: "" }] }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "memories", action: "delete", filters: [{ column: "id", operator: "eq", value: "m1" }] }).ok, true);
});

test("non-admins are scoped to their couple and cannot spoof couple_id", () => {
  const sel: any = authorizeProxy(partner, { table: "memories", action: "select", filters: [{ column: "couple_id", operator: "eq", value: "other" }] });
  assert.equal(sel.ok, true);
  assert.deepEqual(sel.filters.filter((f: any) => f.column === "couple_id"), [{ column: "couple_id", operator: "eq", value: "c1" }]);
  const ins: any = authorizeProxy(partner, { table: "memories", action: "upsert", data: [{ id: "1", couple_id: "other" }], options: { onConflict: "id" } });
  assert.equal(ins.data[0].couple_id, "c1");
  assert.deepEqual(ins.ownershipCheckIds, ["1"]);
  const del: any = authorizeProxy(partner, { table: "memories", action: "delete", filters: [{ column: "id", operator: "eq", value: "1" }] });
  assert.ok(del.filters.some((f: any) => f.column === "couple_id" && f.value === "c1"));
});

test("role boundaries: guests read-only, admin tables admin-only for writes", () => {
  assert.equal(authorizeProxy(guest, { table: "memories", action: "select" }).ok, true);
  assert.equal(authorizeProxy(guest, { table: "memories", action: "insert", data: { id: "1" } }).ok, false);
  for (const t of ["user_accounts", "admin_settings", "couple_tenants", "profiles"]) {
    assert.equal(authorizeProxy(partner, { table: t, action: "upsert", data: { id: "1" } }).ok, false, t);
    assert.equal(authorizeProxy(partner, { table: t, action: "delete", filters: [{ column: "id", operator: "eq", value: "1" }] }).ok, false, t);
  }
  assert.equal(authorizeProxy(admin, { table: "user_accounts", action: "upsert", data: { id: "1" } }).ok, true);
  const own: any = authorizeProxy(partner, { table: "profiles", action: "select" });
  assert.equal(own.ok, true);
  assert.ok(own.filters.some((f: any) => f.column === "username" && f.value === "p"));
});

test("secrets are stripped for non-admin reads", () => {
  const a: any = authorizeProxy(partner, { table: "user_accounts", action: "select" });
  assert.deepEqual(stripColumns([{ id: "1", password: "x", two_factor_secret: "s", role: "user" }], a.stripColumns), [{ id: "1", role: "user" }]);
  const s: any = authorizeProxy(partner, { table: "admin_settings", action: "select" });
  assert.ok(!("password" in (stripColumns({ id: "x", password: "p" }, s.stripColumns) as any)));
  // Even admins never receive password hashes or 2FA secrets in the browser.
  assert.ok((authorizeProxy(admin, { table: "user_accounts", action: "select" }) as any).stripColumns.includes("password"));
});

test("route policy: deny by default, public only health/login/webhook", () => {
  assert.equal(rolesForPath("POST", "/auth/verify-login"), null);
  assert.equal(rolesForPath("POST", "/telegram/webhook"), null);
  assert.deepEqual(rolesForPath("POST", "/telegram/webhook/set"), ["admin"]);
  assert.deepEqual(rolesForPath("POST", "/telegram/senders/clear"), ["admin"]);
  assert.deepEqual(rolesForPath("POST", "/something-new"), ["admin"]);
  assert.ok(!rolesForPath("POST", "/upload-audio")!.includes("guest"));
  assert.ok(!rolesForPath("POST", "/telegram/send")!.includes("guest"));
});

test("login rate limiter blocks after repeated failures", () => {
  resetAllForTests();
  for (let i = 0; i < 8; i++) recordFailure("ip|u");
  assert.equal(isBlocked("ip|u"), true);
  assert.equal(isBlocked("ip|other"), false);
});

import { generateTotp, verifyTotp, consumeBackupCode } from "../server/totp.ts";

test("server TOTP matches RFC 6238 vector and honours the window", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(generateTotp(secret, 59000), "287082");
  assert.equal(verifyTotp("287082", secret, 1, 59000), true);
  assert.equal(verifyTotp("287082", secret, 1, 59000 + 5 * 30000), false);
  assert.equal(verifyTotp("12345", secret), false);
});

test("backup codes normalize and are consumed once", () => {
  const r = consumeBackupCode("abcd 2345", ["ABCD-2345", "WXYZ-6789"]);
  assert.equal(r.valid, true);
  assert.deepEqual(r.remaining, ["WXYZ-6789"]);
  assert.equal(consumeBackupCode("zzzzzzzz", ["ABCD-2345"]).valid, false);
});

const row = (o: any) => ({ id: "x", sender: "ahmed", receiver: null, conversation_id: null, sender_id: null, receiver_id: null, ...o });

test("chat_messages: 1:1 rows are visible only to the two permanent participant ids", async () => {
  const { visibleChatRow, isDirectChatRow } = await import("../server/policy.ts");
  const dm = row({ receiver: "Omar", conversation_id: "ahmed_omar", sender_id: "u:A", receiver_id: "u:O" });
  assert.equal(isDirectChatRow(dm), true);
  assert.equal(visibleChatRow(dm, "u:A"), true);
  assert.equal(visibleChatRow(dm, "u:O"), true);
  assert.equal(visibleChatRow(dm, "u:M"), false); // sender's partner, same couple
  assert.equal(visibleChatRow(dm, "adm:R"), false); // in-app admin
  assert.equal(visibleChatRow(dm, ""), false);
  // a namesake or a re-registered account has a different id, so it inherits nothing
  assert.equal(visibleChatRow({ ...dm, receiver: "Omar" }, "u:O2"), false);
  // legacy 1:1 row without ids: nobody (no username fallback)
  const legacy = row({ receiver: "Omar", conversation_id: "ahmed_omar" });
  for (const p of ["u:A", "u:O", "u:M", "adm:R", ""]) assert.equal(visibleChatRow(legacy, p), false);
  const global = row({ receiver: "global", conversation_id: "global", sender_id: "u:A" });
  assert.equal(visibleChatRow(global, "u:M"), true);
  assert.equal(visibleChatRow(row({ receiver: "group_1", conversation_id: "group_1" }), "u:M"), true);
  assert.equal(visibleChatRow(row({}), "u:M"), true); // unaddressed legacy rows keep couple scope
});

test("chat_messages: mixed/malformed routing and sparse rows are private / fail closed", async () => {
  const { visibleChatRow, isDirectChatRow } = await import("../server/policy.ts");
  const mk = (receiver: any, conversation_id: any) => row({ receiver, conversation_id, sender_id: "u:A", receiver_id: "u:O" });
  for (const r of [mk("omar", "global"), mk("omar", "GLOBAL"), mk("GLOBAL", "GLOBAL"), mk("global ", "global "), mk("Group_1", "Group_1"), mk("omar", "group_x"), mk("global", "ahmed_omar"), mk("group_1", "global"), mk(" omar", "ahmed_omar"), mk("omar", null), mk(null, "ahmed_omar"), mk("global", null)]) {
    assert.equal(isDirectChatRow(r), true, JSON.stringify(r));
    assert.equal(visibleChatRow(r, "u:M"), false);
    assert.equal(visibleChatRow(r, "adm:R"), false);
    assert.equal(visibleChatRow(r, "u:A"), true);
  }
  assert.equal(visibleChatRow({ id: "x" }, "u:M"), false);
  assert.equal(visibleChatRow({ sender: "a", receiver: "global", conversation_id: "global" }, "u:M"), false); // sparse: ids missing
  assert.equal(visibleChatRow(null, "u:M"), false);
});

test("chat_messages proxy: ids are server-stamped, reads and writes are bound to the session pid", async () => {
  const { chatVisibilityOr } = await import("../server/policy.ts");
  const partner: any = { username: "mai", coupleId: "c1", role: "partner", pid: "u:M", expiresAt: Date.now() + 1000 };
  const nopid: any = { ...partner, pid: undefined };
  const admin: any = { username: "root", coupleId: "c0", role: "admin", pid: "adm:R", expiresAt: Date.now() + 1000 };
  assert.equal((authorizeProxy(partner, { table: "chat_messages", action: "select" }) as any).chatViewer, "u:M");
  assert.equal((authorizeProxy(nopid, { table: "chat_messages", action: "select" }) as any).chatViewer, ""); // still filtered, sees non-1:1 only
  assert.equal((authorizeProxy(admin, { table: "chat_messages", action: "select" }) as any).chatViewer, "adm:R");
  const or = chatVisibilityOr("u:M");
  for (const part of ['sender_id.eq."u:M"', 'receiver_id.eq."u:M"', "and(receiver.is.null,conversation_id.is.null)", "and(receiver.eq.global,conversation_id.eq.global)"]) assert.ok(or.includes(part), part);
  assert.ok(!chatVisibilityOr("").includes("sender_id"), "empty pid adds no participant clause");
  assert.ok(!chatVisibilityOr('u:"x').includes('u:"x'), "quotes cannot break out of the or() expression");
  // writes: the sender id is stamped by the server whatever the client sent
  const ins: any = authorizeProxy(partner, { table: "chat_messages", action: "insert", data: { id: "x", sender: "MAI", sender_id: "u:A", receiver: "omar", conversation_id: "mai_omar", receiver_id: "u:O" } });
  assert.equal(ins.ok, true);
  assert.equal(ins.data.sender_id, "u:M");
  assert.equal(authorizeProxy(partner, { table: "chat_messages", action: "insert", data: { id: "x", sender: "ahmed", receiver: "omar", conversation_id: "a_o", receiver_id: "u:O" } }).ok, false);
  assert.equal(authorizeProxy(partner, { table: "chat_messages", action: "insert", data: { id: "x", sender: "mai", receiver: "omar", conversation_id: "a_o" } }).ok, false); // no resolved recipient
  assert.equal(authorizeProxy(partner, { table: "chat_messages", action: "insert", data: { id: "x", sender: "mai", receiver: "omar", conversation_id: "a_o", receiver_id: "omar" } }).ok, false); // a username is not an id
  assert.equal(authorizeProxy(nopid, { table: "chat_messages", action: "insert", data: { id: "x", sender: "mai", receiver: "global", conversation_id: "global" } }).ok, false);
  const g: any = authorizeProxy(partner, { table: "chat_messages", action: "insert", data: { id: "x", sender: "mai", receiver: "global", conversation_id: "global", receiver_id: "u:O" } });
  assert.equal(g.data.receiver_id, null);
  const up: any = authorizeProxy(partner, { table: "chat_messages", action: "upsert", data: { id: "x", sender: "mai", receiver: "omar", conversation_id: "a_o", receiver_id: "u:O" } });
  assert.equal(up.chatSenderCheck, "u:M");
  const del: any = authorizeProxy(partner, { table: "chat_messages", action: "delete", filters: [{ column: "id", operator: "eq", value: "x" }] });
  assert.ok(del.filters.some((f: any) => f.column === "sender_id" && f.operator === "eq" && f.value === "u:M"));
  assert.equal(authorizeProxy(nopid, { table: "chat_messages", action: "delete", filters: [{ column: "id", operator: "eq", value: "x" }] }).ok, false);
  const upd: any = authorizeProxy(partner, { table: "chat_messages", action: "update", data: { seen: true, receiver: "evil", sender: "evil", sender_id: "u:E", receiver_id: "u:E" }, filters: [{ column: "id", operator: "eq", value: "x" }] });
  for (const k of ["receiver", "sender", "sender_id", "receiver_id"]) assert.equal(upd.data[k], undefined);
  assert.ok(upd.filters.some((f: any) => f.column === "sender_id"));
  // admin: filtered like everyone, guarded on writes, may author direct messages only as themselves
  assert.equal((authorizeProxy(admin, { table: "chat_messages", action: "delete", filters: [{ column: "id", operator: "eq", value: "x" }] }) as any).chatDirectGuard, true);
  assert.equal(authorizeProxy(admin, { table: "chat_messages", action: "upsert", data: { id: "x", sender: "ahmed", sender_id: "u:A", receiver: "omar", conversation_id: "a_o", receiver_id: "u:O" } }).ok, false);
  assert.equal(authorizeProxy(admin, { table: "chat_messages", action: "upsert", data: { id: "x", sender: "root", sender_id: "adm:R", receiver: "omar", conversation_id: "r_o", receiver_id: "u:O" } }).ok, false); // no direct writes through the admin proxy at all
  assert.equal(authorizeProxy(admin, { table: "chat_messages", action: "upsert", data: { id: "x", sender: "root", receiver: "global", conversation_id: "global" } }).ok, true);
});

test("chat_messages proxy: sparse projections fetch routing/id columns and strip them again; custom onConflict denied", () => {
  const partner: any = { username: "mai", coupleId: "c1", role: "partner", pid: "u:M", expiresAt: Date.now() + 1000 };
  const a: any = authorizeProxy(partner, { table: "chat_messages", action: "select", select: "id,content" });
  assert.equal(a.ok, true);
  assert.deepEqual(a.chatStripCols, ["sender_id", "receiver_id", "receiver", "conversation_id"]);
  assert.ok(["sender_id", "receiver_id", "receiver", "conversation_id"].every((c) => a.select.split(",").includes(c)));
  assert.equal((authorizeProxy(partner, { table: "chat_messages", action: "select" }) as any).chatStripCols, undefined);
  assert.equal(authorizeProxy(partner, { table: "chat_messages", action: "upsert", data: { id: "x", sender: "mai", receiver: "global", conversation_id: "global" }, options: { onConflict: "couple_id" } }).ok, false);
});

test("participant ids: usernames resolve to exactly one account or not at all", async () => {
  const { resolveUsernamePid, makePid, isPid } = await import("../server/participant.ts");
  assert.equal(makePid("u", "user_1"), "u:user_1");
  assert.equal(makePid("u", ""), "");
  assert.equal(makePid("u", "a b"), "");
  assert.equal(isPid("u:user_1"), true);
  assert.equal(isPid("omar"), false);
  assert.equal(isPid("x:1"), false);
  const users = [{ id: "user_1", username: "Omar", pid_nonce: "n1" }, { id: "user_2", username: "mai", pid_nonce: "n2" }];
  assert.deepEqual(resolveUsernamePid(" omar ", { userRows: users, adminAccounts: [] }), { ok: true, pid: "u:user_1.n1" });
  assert.deepEqual(resolveUsernamePid("zed", { userRows: users, adminAccounts: [] }), { ok: false, reason: "missing" });
  // same name in user_accounts AND admin accounts, or two case variants: refuse, never guess
  assert.deepEqual(resolveUsernamePid("omar", { userRows: users, adminAccounts: [{ id: "admin_1", username: "OMAR" }] }), { ok: false, reason: "ambiguous" });
  assert.deepEqual(resolveUsernamePid("omar", { userRows: [...users, { id: "user_9", username: "OMAR" }], adminAccounts: [] }), { ok: false, reason: "ambiguous" });
  // an account without a permanent id cannot be addressed
  assert.deepEqual(resolveUsernamePid("root", { userRows: [], adminAccounts: [{ username: "root" }] }), { ok: false, reason: "no_id" });
  // legacy credentials row counts only when there are no admin accounts (same rule as login)
  assert.deepEqual(resolveUsernamePid("boss", { userRows: [], adminAccounts: [], legacy: { id: "credentials", username: "boss" } }), { ok: true, pid: "leg:credentials" });
  assert.deepEqual(resolveUsernamePid("boss", { userRows: [], adminAccounts: [{ id: "admin_1", username: "x" }], legacy: { id: "credentials", username: "boss" } }), { ok: false, reason: "missing" });
});

test("supabase session identity check fails closed", async () => {
  const { sessionMatchesIdentity, userPid, adminPid } = await import("../server/participant.ts");
  const jwt = (md: any) => `h.${Buffer.from(JSON.stringify({ app_metadata: md })).toString("base64url")}.s`;
  const want = { pid: "u:a.n1", coupleId: "c1", role: "partner" };
  assert.equal(sessionMatchesIdentity(jwt({ pid: "u:a.n1", couple_id: "c1", role: "partner" }), want), true);
  assert.equal(sessionMatchesIdentity(jwt({ pid: "u:b.n9", couple_id: "c1", role: "partner" }), want), false); // previous holder's pid
  assert.equal(sessionMatchesIdentity(jwt({ couple_id: "c1", role: "partner" }), want), false);               // no pid
  assert.equal(sessionMatchesIdentity(jwt({ pid: "u:a.n1", couple_id: "c2", role: "partner" }), want), false);
  assert.equal(sessionMatchesIdentity("garbage", want), false);
  assert.equal(sessionMatchesIdentity(undefined, want), false);
  // permanent ids need the server nonce: same account id with another nonce is another identity; no nonce, no id
  assert.equal(userPid({ id: "user_1", pid_nonce: "aa" }), "u:user_1.aa");
  assert.notEqual(userPid({ id: "user_1", pid_nonce: "aa" }), userPid({ id: "user_1", pid_nonce: "bb" }));
  assert.equal(userPid({ id: "user_1" }), "");
  assert.equal(adminPid({ id: "admin_1" }), "");
  assert.equal(adminPid({ id: "admin_1", pidNonce: "zz" }), "adm:admin_1.zz");
});

test("admin account merge: nonce is server-generated, kept, never taken from the browser", async () => {
  const { mergeAdminAccounts } = await import("../server/handlers.ts");
  const prev = [{ id: "admin_1", username: "root", password: "h", pidNonce: "keepme" }];
  const m = mergeAdminAccounts(prev, [{ id: "admin_1", username: "root", pidNonce: "forged" }, { id: "admin_2", username: "new", password: "pw", pidNonce: "forged2" }]);
  assert.equal(m.error, undefined);
  assert.equal(m.accounts[0].pidNonce, "keepme");
  assert.match(m.accounts[1].pidNonce, /^[0-9a-f]{32}$/);
  // deleting and re-adding the same id gets a different nonce, so the new account inherits nothing
  const again = mergeAdminAccounts([], [{ id: "admin_1", username: "root", password: "pw" }]);
  assert.notEqual(again.accounts[0].pidNonce, "keepme");
});

test("closed global lounge hides global rows in the proxy filter and post-filter", async () => {
  const { chatVisibilityOr, visibleChatRow } = await import("../server/policy.ts");
  assert.ok(chatVisibilityOr("u:a.n").includes("receiver.eq.global"));
  assert.ok(!chatVisibilityOr("u:a.n", false).includes("receiver.eq.global"));
  assert.ok(chatVisibilityOr("u:a.n", false).includes("sender_id.eq"));
  const row = { receiver: "global", conversation_id: "global", sender_id: null, receiver_id: null };
  assert.equal(visibleChatRow(row, "u:a.n", true), true);
  assert.equal(visibleChatRow(row, "u:a.n", false), false);
  const grp = { receiver: "group_1", conversation_id: "group_1", sender_id: null, receiver_id: null };
  assert.equal(visibleChatRow(grp, "u:a.n", false), true);
});

test("non-admin self-profile writes can never set identity or privilege columns", () => {
  const evil = { id: "other", pid_nonce: "x", pidNonce: "x", username: "p", role: "admin", couple_id: "c9", password: "pw", enable_global_chat: false, gender: "f", display_name: "D", two_factor_enabled: true };
  for (const table of ["user_accounts", "profiles"]) {
    for (const action of ["update", "upsert"] as const) {
      const r: any = authorizeProxy(partner, { table, action, data: evil, filters: [{ column: "username", operator: "eq", value: "someone-else" }] });
      if (!r.ok) continue; // denied outright is also safe
      assert.equal(r.selfProfile, true, `${table}/${action} must be reduced to a self-profile write`);
      const keys = Object.keys(r.data);
      for (const bad of ["id", "pid_nonce", "pidNonce", "role", "couple_id", "password", "two_factor_enabled"]) assert.ok(!keys.includes(bad), `${table}/${action} kept ${bad}`);
      if ("username" in r.data) assert.equal(r.data.username, "p");
      assert.deepEqual(r.filters, [{ column: "username", operator: "eq", value: "p" }]);
    }
  }
  // renaming into another person's name is refused
  assert.equal(authorizeProxy(partner, { table: "user_accounts", action: "update", data: { username: "victim", display_name: "x" } }).ok, false);
  assert.equal(authorizeProxy(partner, { table: "profiles", action: "update", data: { username: "victim" } }).ok, false);
  // inserts are admin only
  assert.equal(authorizeProxy(partner, { table: "user_accounts", action: "insert", data: { id: "n", username: "n" } }).ok, false);
});

test("no shipped SQL file leaves chat_messages open to browser tokens", async () => {
  const fs = await import("node:fs");
  for (const f of ["supabase_schema.sql", "src/lib/databaseSetup.sql", "supabase_hardening.sql"]) {
    const sql = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    for (const stmt of sql.split(";")) {
      if (!/CREATE POLICY[^;]*ON public\.chat_messages/i.test(stmt)) continue;
      assert.ok(!/USING\s*\(\s*true\s*\)/i.test(stmt), `${f}: open chat policy`);
      assert.ok(!/FOR (ALL|INSERT|UPDATE|DELETE)/i.test(stmt) || /service_role'\s*\)/.test(stmt) && !/authenticated/.test(stmt), `${f}: chat writes must be service_role only`);
    }
  }
});

test("api/ stays within the 12 serverless functions the hosting plan allows", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const count = (dir: string): number => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : /\.(ts|js|mjs)$/.test(e.name) ? 1 : 0), 0);
  assert.ok(count(new URL("../api", import.meta.url).pathname) <= 12);
});
