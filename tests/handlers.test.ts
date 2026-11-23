import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

// ---- Fake PostgREST/GoTrue served through global fetch (no network) ----
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const calls: { method: string; table: string; query: string; body?: any }[] = [];

function legacyHash(pw: string) {
  return "sha256_v1:" + crypto.createHash("sha256").update(`OurHome_Secret_Salt:${pw}:OurHome_Secret_Salt`).digest("hex");
}

function matches(row: Row, params: URLSearchParams) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.") && String(row[k]) !== v.slice(3)) return false;
    if (v.startsWith("ilike.") && String(row[k] ?? "").toLowerCase() !== v.slice(6).replace(/\\/g, "").toLowerCase()) return false;
    if (v.startsWith("in.(")) {
      const vals = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
      if (!vals.includes(String(row[k]))) return false;
    }
  }
  return true;
}

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();
  const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.pathname.startsWith("/auth/v1")) {
    if (url.pathname.endsWith("/admin/users") && method === "GET") return json({ users: [], aud: "authenticated" });
    return json({ error: "fake auth" }, 400);
  }
  const table = url.pathname.replace("/rest/v1/", "");
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, table, query: url.search, body });
  const rows = tables[table] || [];
  if (method === "GET") return json(rows.filter((r) => matches(r, url.searchParams)));
  if (method === "PATCH") {
    rows.filter((r) => matches(r, url.searchParams)).forEach((r) => Object.assign(r, body));
    return json([]);
  }
  if (method === "DELETE") return json([]);
  return json(Array.isArray(body) ? body : [body], 201);
}) as any;

process.env.VITE_SUPABASE_URL = "http://fake.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.SERVER_SESSION_SECRET = "s".repeat(48);
delete process.env.ENABLE_PASSWORD_REHASH;

const { verifyLogin, proxy, adminSettingsGet, adminSettingsPost, changePassword, stripeCheckoutDisabled, twoFactor } = await import("../server/handlers.ts");
const { createServerSession, verifyServerSession, hashPasswordScrypt } = await import("../server/auth.ts");
const { generateTotp } = await import("../server/totp.ts");
const { resetAllForTests } = await import("../server/ratelimit.ts");

function mockRes() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
const req = (body: any, headers: Record<string, string> = {}) => ({ body, headers, socket: { remoteAddress: "127.0.0.1" } });
const tokenFor = (role: any, username = "alice", coupleId = "c1") => createServerSession({ username, coupleId, role });
const TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function reset() {
  resetAllForTests();
  calls.length = 0;
  tables.admin_settings = [{ id: "adminAccounts", admin_accounts: [{ id: "a1", username: "boss", password: legacyHash("boss-pass-1"), coupleId: "c1" }] }, { id: "theme", favicon: "x" }];
  tables.user_accounts = [
    { id: "user_alice", username: "alice", password: legacyHash("alice-pass-1"), role: "user", couple_id: "c1" },
    { id: "user_bob", username: "bob", password: "plain-bob-pass", role: "guest", couple_id: "c2" },
    { id: "user_tfa", username: "tfa", password: legacyHash("tfa-pass-123"), role: "user", couple_id: "c1", two_factor_enabled: true, two_factor_secret: TOTP_SECRET, two_factor_backup_codes: ["ABCD-2345", "WXYZ-6789"] },
    { id: "user_new", username: "carol", password: hashPasswordScrypt("carol-pass-1"), role: "user", couple_id: "c1" },
  ];
}

test("compat: legacy sha256, plaintext, scrypt and admin_accounts-column credentials all log in", async () => {
  for (const [u, p, role] of [["alice", "alice-pass-1", "partner"], ["bob", "plain-bob-pass", "guest"], ["carol", "carol-pass-1", "partner"], ["boss", "boss-pass-1", "admin"]] as const) {
    reset();
    const res = mockRes();
    await verifyLogin(req({ username: u, password: p }), res);
    assert.equal(res.body.success, true, u);
    assert.equal(verifyServerSession(res.body.sessionToken)?.role, role, u);
  }
});

test("login rejects wrong password, unknown user and is rate limited", async () => {
  reset();
  for (let i = 0; i < 8; i++) {
    const res = mockRes();
    await verifyLogin(req({ username: "alice", password: "nope" }), res);
    assert.equal(res.body.success, false);
  }
  const blocked = mockRes();
  await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), blocked);
  assert.equal(blocked.statusCode, 429);
  reset();
  const unknown = mockRes();
  await verifyLogin(req({ username: "nobody", password: "x" }), unknown);
  assert.equal(unknown.body.success, false);
});

test("login never loads every account and never returns hashes", async () => {
  reset();
  const res = mockRes();
  await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), res);
  assert.ok(!JSON.stringify(res.body).includes("sha256_v1"));
  assert.ok(calls.filter((c) => c.table === "user_accounts").every((c) => c.query.includes("username=") || c.query.includes("id=in")));
});

test("2FA is enforced by the server: no session without a valid second factor", async () => {
  reset();
  let res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "tfa-pass-123" }), res);
  assert.equal(res.body.success, false);
  assert.equal(res.body.requires2fa, true);
  assert.equal(res.body.sessionToken, undefined);

  res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "tfa-pass-123", totp: "000000" }), res);
  assert.equal(res.body.success, false);

  res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "wrong-pass", totp: generateTotp(TOTP_SECRET) }), res);
  assert.equal(res.body.success, false);

  res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "tfa-pass-123", totp: generateTotp(TOTP_SECRET) }), res);
  assert.equal(res.body.success, true);
});

test("2FA backup code is single use and consumed server-side", async () => {
  reset();
  let res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "tfa-pass-123", backupCode: "abcd2345" }), res);
  assert.equal(res.body.success, true);
  assert.deepEqual(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_backup_codes, ["WXYZ-6789"]);
  res = mockRes();
  await verifyLogin(req({ username: "tfa", password: "tfa-pass-123", backupCode: "abcd2345" }), res);
  assert.equal(res.body.success, false);
});

test("password rehash on login is opt-in: no live write unless ENABLE_PASSWORD_REHASH=true", async () => {
  reset();
  await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), mockRes());
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
  assert.ok(tables.user_accounts[0].password.startsWith("sha256_v1:"));

  reset();
  process.env.ENABLE_PASSWORD_REHASH = "true";
  try {
    const res = mockRes();
    await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), res);
    assert.equal(res.body.success, true);
    assert.ok(tables.user_accounts[0].password.startsWith("scrypt_v1:"));
    // upgraded hash still logs in
    const again = mockRes();
    await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), again);
    assert.equal(again.body.success, true);
  } finally {
    delete process.env.ENABLE_PASSWORD_REHASH;
  }
});

test("proxy: no/forged session is rejected before any database call", async () => {
  reset();
  for (const headers of [{}, { "x-server-session": "forged.token" }]) {
    const res = mockRes();
    await proxy(req({ table: "memories", action: "select" }, headers), res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(calls.length, 0);
});

test("proxy: negative authorization, nothing reaches the database", async () => {
  reset();
  const cases: [any, any][] = [
    [tokenFor("partner"), { table: "user_accounts", action: "upsert", data: { id: "x", username: "evil", role: "admin" } }],
    [tokenFor("partner"), { table: "admin_settings", action: "upsert", data: { id: "adminAccounts" } }],
    [tokenFor("partner"), { table: "memories", action: "delete" }],
    [tokenFor("partner"), { table: "memories", action: "delete", filters: [{ column: "id", operator: "gt", value: "0" }] }],
    [tokenFor("guest"), { table: "memories", action: "insert", data: { id: "m" } }],
    [tokenFor("partner"), { table: "auth.users", action: "select" }],
    [tokenFor("partner"), { table: "user_accounts", action: "update", data: { role: "admin" }, filters: [{ column: "username", operator: "eq", value: "bob" }] }],
  ];
  for (const [token, body] of cases) {
    const res = mockRes();
    await proxy(req(body, { "x-server-session": token }), res);
    assert.ok(res.statusCode >= 400, JSON.stringify(body));
  }
  assert.equal(calls.filter((c) => c.method !== "GET").length, 0);
});

test("proxy: partner cannot overwrite another couple's row via upsert", async () => {
  reset();
  tables.memories = [{ id: "m-other", couple_id: "c2", title: "theirs" }];
  const res = mockRes();
  await proxy(req({ table: "memories", action: "upsert", data: { id: "m-other", title: "mine" }, options: { onConflict: "id" } }, { "x-server-session": tokenFor("partner") }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});

test("proxy: own-profile edit keeps working but cannot escalate role or touch password", async () => {
  reset();
  const res = mockRes();
  await proxy(
    req({ table: "user_accounts", action: "upsert", data: { id: "user_alice", username: "alice", role: "admin", password: "x", couple_id: "c2", gender: "female", telegram_username: "@alice" }, options: { onConflict: "id" } }, { "x-server-session": tokenFor("partner") }),
    res,
  );
  assert.equal(res.body.success, true);
  const alice = tables.user_accounts.find((u) => u.id === "user_alice")!;
  assert.equal(alice.role, "user");
  assert.equal(alice.couple_id, "c1");
  assert.ok(alice.password.startsWith("sha256_v1:"));
  assert.equal(alice.gender, "female");
  const patch = calls.find((c) => c.method === "PATCH")!;
  assert.ok(patch.query.includes("username=eq.alice"));
});

test("proxy: non-admin reads strip secrets and hide admin credential rows", async () => {
  reset();
  const res = mockRes();
  await proxy(req({ table: "user_accounts", action: "select" }, { "x-server-session": tokenFor("partner") }), res);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.length > 0 && res.body.data.every((u: any) => !("password" in u) && !("two_factor_secret" in u) && u.couple_id === "c1"));
  const settings = mockRes();
  await adminSettingsGet(req({}, { "x-server-session": tokenFor("partner") }), settings);
  assert.ok(!settings.body.settings.some((s: any) => s.id === "adminAccounts"));
  const adminSettings = mockRes();
  await adminSettingsGet(req({}, { "x-server-session": tokenFor("admin", "boss") }), adminSettings);
  assert.ok(adminSettings.body.settings.some((s: any) => s.id === "adminAccounts"));
});

test("change-password verifies the old password and rejects short ones", async () => {
  reset();
  let res = mockRes();
  await changePassword(req({ oldPassword: "bad", newPassword: "long-enough-1" }, { "x-server-session": tokenFor("partner") }), res);
  assert.equal(res.statusCode, 403);
  res = mockRes();
  await changePassword(req({ oldPassword: "alice-pass-1", newPassword: "short" }, { "x-server-session": tokenFor("partner") }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await changePassword(req({ oldPassword: "alice-pass-1", newPassword: "brand-new-pass" }, { "x-server-session": tokenFor("partner") }), res);
  assert.equal(res.body.success, true);
  const login = mockRes();
  await verifyLogin(req({ username: "alice", password: "brand-new-pass" }), login);
  assert.equal(login.body.success, true);
  const old = mockRes();
  await verifyLogin(req({ username: "alice", password: "alice-pass-1" }), old);
  assert.equal(old.body.success, false);
});

test("payments fail closed: never reports a completed checkout", () => {
  const res = mockRes();
  stripeCheckoutDisabled(req({ plan: "pro" }), res);
  assert.equal(res.statusCode, 501);
  assert.notEqual(res.body.success, true);
  assert.notEqual(res.body.status, "complete");
});

test("2FA: enrolling or disabling needs the current password; a bare session is not enough", async () => {
  reset();
  const h = { "x-server-session": tokenFor("user", "alice") };
  let r = mockRes();
  await twoFactor(req({ action: "enable", secret: TOTP_SECRET, enrollCode: generateTotp(TOTP_SECRET), backupCodes: ["AAAA-1111"] }, h), r);
  assert.equal(r.statusCode, 400);
  r = mockRes();
  await twoFactor(req({ action: "enable", password: "wrong-pass", secret: TOTP_SECRET, enrollCode: generateTotp(TOTP_SECRET), backupCodes: ["AAAA-1111"] }, h), r);
  assert.equal(r.statusCode, 403);
  assert.ok(!tables.user_accounts.find((u) => u.id === "user_alice")!.two_factor_enabled);
  r = mockRes();
  await twoFactor(req({ action: "enable", password: "alice-pass-1", secret: TOTP_SECRET, enrollCode: "000000", backupCodes: ["AAAA-1111"] }, h), r);
  assert.equal(r.statusCode, 400);
  r = mockRes();
  await twoFactor(req({ action: "enable", password: "alice-pass-1", secret: TOTP_SECRET, enrollCode: generateTotp(TOTP_SECRET), backupCodes: ["AAAA-1111"] }, h), r);
  assert.equal(r.body.success, true);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_alice")!.two_factor_enabled, true);
});

test("2FA: disabling an enabled account needs password AND a valid code; users cannot touch others", async () => {
  reset();
  const h = { "x-server-session": tokenFor("user", "tfa") };
  let r = mockRes();
  await twoFactor(req({ action: "disable", password: "tfa-pass-123" }, h), r);
  assert.equal(r.statusCode, 403);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_enabled, true);
  r = mockRes();
  await twoFactor(req({ action: "disable", password: "tfa-pass-123", code: generateTotp(TOTP_SECRET) }, h), r);
  assert.equal(r.body.success, true);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_enabled, false);
  reset();
  r = mockRes();
  await twoFactor(req({ action: "disable", password: "alice-pass-1", targetUsername: "tfa" }, { "x-server-session": tokenFor("user", "alice") }), r);
  assert.equal(r.statusCode, 403);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_enabled, true);
});

test("proxy: 2FA columns are not writable through the generic proxy, even by self", async () => {
  reset();
  const r = mockRes();
  await proxy(req({ table: "user_accounts", action: "update", data: { two_factor_enabled: false, two_factor_secret: "" }, filters: [{ column: "username", operator: "eq", value: "tfa" }] }, { "x-server-session": tokenFor("user", "tfa") }), r);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_enabled, true);
  assert.equal(tables.user_accounts.find((u) => u.id === "user_tfa")!.two_factor_secret, TOTP_SECRET);
});

test("admin payloads never contain password hashes or 2FA secrets; admin writes hash plaintext and keep stored values", async () => {
  reset();
  tables.admin_settings[0].admin_accounts[0].twoFactorSecret = TOTP_SECRET;
  const h = { "x-server-session": tokenFor("admin", "boss") };
  let r = mockRes();
  await adminSettingsGet(req({}, h), r);
  const dump = JSON.stringify(r.body);
  assert.ok(!dump.includes("sha256_v1"), "hash leaked to browser");
  assert.ok(!dump.includes(TOTP_SECRET), "2FA secret leaked to browser");
  // admin saves the (redacted) list back plus a new admin with plaintext
  const list = [{ id: "a1", username: "boss", coupleId: "c1" }, { id: "a2", username: "newadmin", password: "brand-new-pass" }];
  r = mockRes();
  await adminSettingsPost(req({ id: "adminAccounts", adminAccounts: list, admin_accounts: list }, h), r);
  assert.equal(r.body?.success, true, JSON.stringify(r.body));
  const w = calls.filter((c) => c.table === "admin_settings" && c.body).pop()!;
  const stored = (Array.isArray(w.body) ? w.body[0] : w.body).admin_accounts;
  assert.equal(stored[0].password, legacyHash("boss-pass-1"));
  assert.equal(stored[0].twoFactorSecret, TOTP_SECRET);
  assert.ok(stored[1].password.startsWith("scrypt_v1:"));
  // proxy: admin-created user gets hashed, never stored plaintext
  r = mockRes();
  await proxy(req({ table: "user_accounts", action: "upsert", data: { id: "user_z", username: "zed", password: "zed-password-1", role: "user", couple_id: "c9" }, onConflict: "id" }, h), r);
  const zed = calls.filter((c) => c.table === "user_accounts" && c.body?.username === "zed").pop();
  assert.ok(zed && String(zed.body.password).startsWith("scrypt_v1:") || zed?.body?.[0]?.password?.startsWith("scrypt_v1:"));
});
