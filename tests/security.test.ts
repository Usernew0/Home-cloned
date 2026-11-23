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
