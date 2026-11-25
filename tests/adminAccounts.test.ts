import test from "node:test";
import assert from "node:assert/strict";
import { makeAdminAccountHandlers } from "../server/adminAccounts";
import { createServerSession } from "../server/auth";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-test-secret-test-secret-123";
function fakeDb(opts: { dup?: boolean } = {}) {
  const state: any = { inserted: null, profile: null };
  const q = (t: string) => {
    const api: any = {
      select: () => api, ilike: () => api, limit: () => Promise.resolve({ data: opts.dup ? [{ id: "x" }] : [], error: null }),
      insert: (row: any) => { state.inserted = row; return { select: () => ({ single: async () => ({ data: { id: row.id, username: row.username, couple_id: "couple_" + row.id.slice(5), personal_couple_id: "couple_" + row.id.slice(5), plan: row.plan ?? null }, error: null }) }) }; },
      eq: () => ({ maybeSingle: async () => ({ data: { couple_id: "x", plan: state.inserted?.plan ?? "free", partner1: state.inserted?.username, partner2: "" }, error: null }) }),
      upsert: async (r: any) => { state.profile = r; return { error: null }; },
    };
    return api;
  };
  return { db: { from: q }, state };
}
function res() { const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(b: any) { r.body = b; return r; } }; return r; }
process.env.SERVER_SESSION_SECRET ||= process.env.SESSION_SECRET;
const req = (role: string, body: any) => ({ method: "POST", body, headers: { "x-server-session": createServerSession({ username: "adm", coupleId: "admin", role: role as any, pid: "a:x.n" }) }, query: {} }) as any;

test("admin create: non-admin refused; request cannot set space ids; plan omitted stays unset; real ids returned", async () => {
  const { db, state } = fakeDb();
  const h = makeAdminAccountHandlers(() => db);
  const r1 = res(); await h.create(req("user", { username: "newbie", password: "secret1" }), r1);
  assert.equal(r1.code, 403);
  assert.equal(state.inserted, null);
  const r2 = res(); await h.create(req("admin", { username: "newbie", password: "secret1", coupleId: "couple_evil", personal_couple_id: "couple_evil", plan: "" }), r2);
  assert.equal(r2.code, 200);
  assert.equal("couple_id" in state.inserted, false);
  assert.equal("plan" in state.inserted, false);
  assert.match(state.inserted.password, /^scrypt_v1:/);
  assert.equal(r2.body.account.personalCoupleId, r2.body.account.coupleId);
  assert.equal(r2.body.plan, "free");
});

test("admin create: unique-index violation from a concurrent create is a 409; missing profile/tenant produce truthful warnings", async () => {
  const dbRace: any = { from: () => { const api: any = { select: () => api, ilike: () => api, limit: async () => ({ data: [], error: null }), insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }) }) }; return api; } };
  const r = res(); await makeAdminAccountHandlers(() => dbRace).create(req("admin", { username: "newbie", password: "secret1" }), r);
  assert.equal(r.code, 409);
  const dbWarn: any = { from: () => { const api: any = { select: () => api, ilike: () => api, limit: async () => ({ data: [], error: null }), insert: (row: any) => ({ select: () => ({ single: async () => ({ data: { id: row.id, username: row.username, couple_id: "couple_z", personal_couple_id: "couple_z", plan: null }, error: null }) }) }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), upsert: async () => ({ error: { message: "x" } }) }; return api; } };
  const r2 = res(); await makeAdminAccountHandlers(() => dbWarn).create(req("admin", { username: "newbie2", password: "secret1" }), r2);
  assert.equal(r2.code, 200); assert.equal(r2.body.plan, null); assert.equal(r2.body.warnings.length, 2);
});
