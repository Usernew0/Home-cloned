// SYNTHETIC: fake rpc db + in-memory fs. Not a real-service result.
import test from "node:test";
import assert from "node:assert/strict";
import { linkWith, unlinkWith, makeRpcSqlStore } from "../server/membershipOps.ts";
import type { FsStore } from "../server/membershipSaga.ts";

function fakeDb() {
  const ops = new Map<string, any>(); const accounts = [{ id: "a", username: "Ann" }, { id: "b", username: "Bob" }]; const calls: string[] = [];
  const pids: any = { a: "u:a.n", b: "u:b.n" };
  return { ops, calls,
    from: (t: string) => ({ select: async () => ({ data: t === "user_accounts" ? accounts : [], error: null }) }),
    rpc: async (fn: string, a: any) => {
      calls.push(fn);
      if (fn === "mem_reserve") { const ids = a.p_kind === "link" ? [a.p_a, a.p_b].sort() : ["a", "b"]; if (a.p_kind === "unlink" && a.p_couple !== "joint1") return { data: null, error: { message: "no linked joint space with that id" } };
        const o = { tx_id: a.p_tx, kind: a.p_kind, account_ids: ids, from_spaces: { a: "pa", b: "pb" }, to_spaces: { a: "joint1", b: "joint1" }, tenant_id: "joint1", tenant_name: a.p_name, pair_key: "a|b", step: "reserved", fence: 1 }; ops.set(a.p_tx, o); return { data: o, error: null }; }
      const o = ops.get(a.p_tx);
      if (fn === "mem_get_op") return { data: o ? { ...o, pids } : null, error: null };
      if (fn === "mem_advance") { if (o.fence !== Number(a.p_fence) || o.step !== a.p_from) return { data: null, error: { message: "stale" } }; o.step = a.p_to; o.fence++; return { data: o.fence, error: null }; }
      if (fn === "mem_commit") { if (o.step !== "fs_frozen") return { data: null, error: { message: "not frozen" } }; o.step = "db_committed"; o.fence++; return { data: o.fence, error: null }; }
      return { data: null, error: { message: "unknown" } };
    } };
}
function memFs(): FsStore { const d = new Map<string, any>(); let t = 1;
  return { async get(p) { const x = d.get(p); return x ? { doc: { ...x.doc }, updateTime: String(x.t) } : null; },
    async set(p, doc, pre) { const x = d.get(p); if ("exists" in pre ? !!x : !x || String(x.t) !== pre.updateTime) throw new (await import("../server/membershipSaga.ts")).FsConflict("c"); d.set(p, { doc: { ...doc }, t: t++ }); return String(t); },
    async del(p, pre) { const x = d.get(p); if (!x || String(x.t) !== pre.updateTime) throw new (await import("../server/membershipSaga.ts")).FsConflict("c"); d.delete(p); } }; }

test("link: usernames resolve to account ids, saga runs through the rpc adapter to done", async () => {
  const db = fakeDb(); const r = await linkWith(db, memFs(), { partner1: "ann", partner2: "BOB", coupleName: "AB" }, () => "tx_12345678");
  assert.equal(r.status, 200); assert.equal((r.body as any).step, "done");
  assert.deepEqual(db.calls.filter((c) => c === "mem_commit"), ["mem_commit"]);
});
test("link refuses without a Firestore store (503) and before any rpc", async () => {
  const db = fakeDb(); const r = await linkWith(db, null, { partner1: "ann", partner2: "bob" });
  assert.equal(r.status, 503); assert.equal(db.calls.length, 0);
});
test("link refuses same/unknown accounts with nothing changed", async () => {
  const db = fakeDb();
  assert.equal((await linkWith(db, memFs(), { partner1: "ann", partner2: "ann" })).status, 400);
  assert.equal((await linkWith(db, memFs(), { partner1: "ann", partner2: "zed" })).status, 400);
  assert.equal(db.calls.length, 0);
});
test("unlink: unknown joint space is a 409 refusal; known one completes", async () => {
  const db = fakeDb();
  assert.equal((await unlinkWith(db, memFs(), { coupleId: "nope" }, () => "tx_aaaaaaaa")).status, 409);
  const r = await unlinkWith(db, memFs(), { coupleId: "joint1" }, () => "tx_bbbbbbbb"); assert.equal(r.status, 200); assert.equal((r.body as any).step, "done");
});
test("a Firestore failure before commit aborts the op and reports it", async () => {
  const db = fakeDb(); const bad: FsStore = { ...memFs(), async set() { throw new Error("denied"); } };
  const r = await linkWith(db, bad, { partner1: "ann", partner2: "bob" }, () => "tx_cccccccc");
  assert.equal(r.status, 500); assert.equal(db.ops.get("tx_cccccccc").step, "aborted"); assert.ok(!db.calls.includes("mem_commit"));
});

import { backfillWith } from "../server/membershipOps.ts";
test("backfill: dry run only counts; apply needs a passing probe; existing docs are never overwritten; mismatches are reported", async () => {
  const fsx = memFs();
  await fsx.set("u:a.n1", { coupleId: "OLD", state: "active", txId: "x", fence: 0 }, { exists: false });
  const db: any = { from: () => ({ select: async () => ({ data: [{ id: "a", couple_id: "ca", pid_nonce: "n1" }, { id: "b", couple_id: "cb", pid_nonce: "n2" }, { id: "c", couple_id: "", pid_nonce: "n3" }], error: null }) }) };
  const okProbe = async () => ({ ok: true, step: "done" });
  const dry: any = await backfillWith(db, { store: fsx, probe: okProbe }, {});
  assert.deepEqual(dry.body, { success: true, dryRun: true, accounts: 2, present: 0, missing: 1, mismatched: 1, skippedNoSpace: 1 });
  assert.equal(await fsx.get("u:b.n2"), null);
  const bad: any = await backfillWith(db, { store: fsx, probe: async () => ({ ok: false, step: "write" }) }, { apply: true });
  assert.equal(bad.status, 409); assert.equal(await fsx.get("u:b.n2"), null);
  const done: any = await backfillWith(db, { store: fsx, probe: okProbe }, { apply: true });
  assert.equal(done.body.created, 1); assert.equal((await fsx.get("u:a.n1"))!.doc.coupleId, "OLD");
  assert.equal((await fsx.get("u:b.n2"))!.doc.coupleId, "cb");
});
