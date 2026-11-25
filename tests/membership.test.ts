// SYNTHETIC: fake db object, no real Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveMembership, chooseSpace } from "../server/membership.ts";
process.env.MEMBERSHIP_V2 = "1";

function fakeDb(opts: { acc?: any; accErr?: any; lock?: any; lockErr?: any; cfg?: any; cfgErr?: any }) {
  const cfg = opts.cfgErr ? { data: null, error: opts.cfgErr } : { data: opts.cfg ?? { enabled: true }, error: null };
  return { from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () =>
    t === "membership_config" ? cfg : t === "user_accounts" ? { data: opts.acc ?? null, error: opts.accErr ?? null } : { data: opts.lock ?? null, error: opts.lockErr ?? null } }) }) }) };
}
const N = "a".repeat(32);
const acc = { id: "A", couple_id: "joint_x", personal_couple_id: "pa", pid_nonce: N };
const pid = `u:A.${N}`;

test("live row decides the space: stale session id is ignored, personal is the default for data tables", async () => {
  const m: any = await resolveMembership(fakeDb({ acc }), { pid });
  const r: any = chooseSpace(m, "memories", undefined, "STALE_OLD_SESSION_SPACE");
  assert.equal(r.coupleId, "pa");
  assert.equal((chooseSpace(m, "memories", "joint", "STALE") as any).coupleId, "joint_x");
  assert.equal((chooseSpace(m, "chat_messages", undefined, "STALE") as any).coupleId, "joint_x");
  assert.equal((chooseSpace(m, "chat_messages", "personal", "S") as any).ok, false);
});
test("not linked: asking for the joint space is refused", async () => {
  const m: any = await resolveMembership(fakeDb({ acc: { ...acc, couple_id: "pa" } }), { pid });
  assert.equal((chooseSpace(m, "memories", "joint", "pa") as any).ok, false);
});
test("an open membership op denies, a wrong nonce and an unknown account are refused", async () => {
  const locked: any = await resolveMembership(fakeDb({ acc, lock: { account_id: "A" } }), { pid });
  assert.equal((chooseSpace(locked, "memories", undefined, "x") as any).status, 409);
  const bad: any = await resolveMembership(fakeDb({ acc }), { pid: `u:A.${"b".repeat(32)}` });
  assert.equal(bad.status, 409);
  const none: any = await resolveMembership(fakeDb({}), { pid });
  assert.equal(none.status, 409);
});
test("cutover gate: table absent or disabled = legacy; enabled = strict and every error fails closed", async () => {
  delete process.env.MEMBERSHIP_V2; // pre-cutover release: env latch off
  const absent: any = await resolveMembership(fakeDb({ cfgErr: { code: "42P01" } }), { pid });
  assert.equal(absent.mode, "legacy");
  const off: any = await resolveMembership(fakeDb({ cfg: { enabled: false } }), { pid });
  assert.equal(off.mode, "legacy");
  assert.equal((chooseSpace(off, "memories", undefined, "sess") as any).coupleId, "sess");
  assert.equal((chooseSpace(off, "memories", "joint", "sess") as any).ok, false);
  process.env.MEMBERSHIP_V2 = "1";
  // after activation a missing-column error is NOT treated as legacy
  const down: any = await resolveMembership(fakeDb({ accErr: { code: "42703" } }), { pid });
  assert.equal(down.status, 503);
  const cfgDown: any = await resolveMembership(fakeDb({ cfgErr: { code: "XX000" } }), { pid });
  assert.equal(cfgDown.status, 503);
  const lockDown: any = await resolveMembership(fakeDb({ acc, lockErr: { code: "42P01" } }), { pid });
  assert.equal(lockDown.status, 503);
});
test("enabled: missing, admin-style or unknown pids are refused, not given a stale scope", async () => {
  for (const p of [undefined, "", "adm:root.x", "leg:1"]) assert.equal(((await resolveMembership(fakeDb({ acc }), { pid: p })) as any).status, 401);
});
test("the joint space is read-only: writes there are refused (private by default)", async () => {
  const m: any = await resolveMembership(fakeDb({ acc }), { pid });
  assert.equal((chooseSpace(m, "memories", "joint", "s", "select") as any).coupleId, "joint_x");
  for (const a of ["insert", "upsert", "update", "delete"]) assert.equal((chooseSpace(m, "memories", "joint", "s", a) as any).status, 403);
  assert.equal((chooseSpace(m, "memories", undefined, "s", "insert") as any).coupleId, "pa");
});
test("strict mode: account without a personal id fails closed with 409, never falls back to the current space", async () => {
  const m: any = await resolveMembership(fakeDb({ acc: { ...acc, personal_couple_id: null } }), { pid });
  const r: any = chooseSpace(m, "memories", undefined, "s");
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
});

import { membershipEnabled as _me } from "../server/membership.ts";
const cfgDb = (res: any) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) });
test("env latch on: missing table, missing row, enabled=false, unreadable are all 503, never legacy", async () => {
  const env = { MEMBERSHIP_V2: "1" };
  for (const res of [{ data: null, error: { code: "42P01" } }, { data: null, error: null }, { data: { enabled: false }, error: null }, { data: null, error: { code: "XX" } }]) {
    const r: any = await _me(cfgDb(res), env);
    assert.equal(r.status, 503);
  }
  assert.equal(await _me(cfgDb({ data: { enabled: true }, error: null }), env), true);
});
test("env latch off: legacy only while DB config is off or absent; DB on with env off is 503", async () => {
  assert.equal(await _me(cfgDb({ data: null, error: { code: "42P01" } }), {}), false);
  assert.equal(await _me(cfgDb({ data: { enabled: false }, error: null }), {}), false);
  assert.equal(((await _me(cfgDb({ data: { enabled: true }, error: null }), {})) as any).status, 503);
});

import { PERSONAL_TABLES } from "../server/membership.ts";
import { COUPLE_TABLES } from "../server/policy.ts";
test("activity_logs: table lists are as designed and writes land in the personal space (joint refused)", async () => {
  assert.deepEqual([...COUPLE_TABLES], ["milestones", "date_plans", "memories", "letters", "couple_questions", "activity_logs", "celebration_cards", "chat_messages"]);
  assert.deepEqual(PERSONAL_TABLES, ["milestones", "date_plans", "memories", "letters", "couple_questions", "activity_logs", "celebration_cards"]);
  const m: any = await resolveMembership(fakeDb({ acc }), { pid });
  for (const action of ["insert", "update", "delete"]) assert.equal((chooseSpace(m, "activity_logs", undefined, "STALE", action) as any).coupleId, "pa");
  assert.equal((chooseSpace(m, "activity_logs", "joint", "STALE", "insert") as any).status, 403);
  assert.equal((chooseSpace(m, "activity_logs", "joint", "STALE", "select") as any).coupleId, "joint_x");
});
