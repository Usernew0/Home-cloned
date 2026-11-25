// SYNTHETIC: in-memory fakes of the SQL ops and Firestore. Not a real-service result.
import test from "node:test";
import assert from "node:assert/strict";
import { runOp, abortOp, repairOp, FsConflict, type FsStore, type SqlStore, type Op, type MemberDoc, type Step } from "../server/membershipSaga.ts";

function makeWorld(init: Record<string, string>, seedDocs = true) {
  const accounts = { ...init };
  const ops = new Map<string, Op>();
  const locks = new Map<string, string>();
  const docs = new Map<string, { doc: MemberDoc; t: number }>();
  let clock = 1;
  if (seedDocs) for (const [a, c] of Object.entries(init)) docs.set(`u:${a}.n`, { doc: { coupleId: c, state: "active", txId: "seed", fence: 0 }, t: clock++ });
  const hooks: { beforeFsSet?: (pid: string, doc: MemberDoc) => void; beforeCommit?: () => void } = {};
  const sql: SqlStore = {
    async reserve(txId, kind, accountIds, to, tenant) {
      for (const a of accountIds) if (locks.has(a)) throw new Error("another op open");
      const from: Record<string, string> = {}; for (const a of accountIds) from[a] = accounts[a];
      for (const a of accountIds) locks.set(a, txId);
      const pids: Record<string, string> = {}; for (const a of accountIds) pids[a] = `u:${a}.n`;
      const op: Op = { txId, kind, accountIds, from, to, step: "reserved", fence: 1, tenant, pids };
      ops.set(txId, op); return { ...op };
    },
    async getOp(t) { const o = ops.get(t); return o ? { ...o } : null; },
    async commit(t, fence) {
      hooks.beforeCommit?.();
      const o = ops.get(t)!;
      if (o.step !== "fs_frozen" || o.fence !== fence) throw new Error("stale");
      for (const [a, c] of Object.entries(o.to)) accounts[a] = c;
      o.step = "db_committed"; o.fence++;
    },
    async advance(t, fence, from: Step, step: Step) {
      const o = ops.get(t)!; if (o.fence !== fence || o.step !== from) throw new Error("stale fence");
      o.step = step; o.fence++;
      if (step === "done" || step === "aborted") for (const a of o.accountIds) if (locks.get(a) === t) locks.delete(a);
      return o.fence;
    },
  };
  const fs: FsStore = {
    async get(pid) { const d = docs.get(pid); return d ? { doc: { ...d.doc }, updateTime: String(d.t) } : null; },
    async set(pid, doc, pre) {
      hooks.beforeFsSet?.(pid, doc);
      const d = docs.get(pid);
      if ("exists" in pre) { if (d) throw new FsConflict("exists"); }
      else if (!d || String(d.t) !== pre.updateTime) throw new FsConflict("updateTime");
      docs.set(pid, { doc: { ...doc }, t: clock++ }); return String(clock);
    },
    async del(pid, pre) {
      hooks.beforeFsSet?.(pid, { coupleId: "", state: "active", txId: "del", fence: 0 });
      const d = docs.get(pid);
      if (!d || String(d.t) !== pre.updateTime) throw new FsConflict("updateTime");
      docs.delete(pid);
    },
  };
  return { accounts, ops, locks, docs, sql, fs, hooks };
}
const TO = { a: "joint", b: "joint" };

test("happy path ends done, accounts and Firestore docs match, locks released", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  const op = await runOp(w.sql, w.fs, "t1");
  assert.equal(op.step, "done");
  assert.deepEqual(w.accounts, { a: "joint", b: "joint" });
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "joint");
  assert.equal(w.docs.get("u:b.n")!.doc.state, "active");
  assert.equal(w.locks.size, 0);
});

test("old Firestore docs are frozen for BOTH pids before the SQL commit happens", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  w.hooks.beforeCommit = () => {
    assert.equal(w.docs.get("u:a.n")!.doc.state, "transition");
    assert.equal(w.docs.get("u:b.n")!.doc.state, "transition");
  };
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  await runOp(w.sql, w.fs, "t1");
});

test("freeze fails for the second pid: no SQL commit, abort restores the first, locks released", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  w.hooks.beforeFsSet = (pid, doc) => { if (pid === "u:b.n" && doc.state === "transition") throw new Error("firestore down"); };
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /firestore down/);
  assert.deepEqual(w.accounts, { a: "pa", b: "pb" });
  assert.equal(w.docs.get("u:a.n")!.doc.state, "transition"); // denied while the op is open, not old access
  w.hooks.beforeFsSet = undefined;
  await abortOp(w.sql, w.fs, "t1");
  assert.equal(w.docs.get("u:a.n")!.doc.state, "active");
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "pa");
  assert.equal(w.locks.size, 0);
});

test("crash after SQL commit: resume activates, nothing is cleared early", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  w.hooks.beforeFsSet = (_p, doc) => { if (doc.state === "active" && doc.txId === "t1") throw new Error("crash"); };
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /crash/);
  assert.equal(w.ops.get("t1")!.step, "db_committed");
  assert.equal(w.locks.size, 2); // mutex still held
  await assert.rejects(w.sql.reserve("t2", "unlink", ["a"], { a: "pa" }, null), /another op open/);
  await assert.rejects(abortOp(w.sql, w.fs, "t1"), /past commit/);
  w.hooks.beforeFsSet = undefined;
  assert.equal((await runOp(w.sql, w.fs, "t1")).step, "done");
  assert.equal(w.docs.get("u:b.n")!.doc.coupleId, "joint");
});

test("resume is idempotent at every step (run twice, crash/restart between steps)", async () => {
  for (const failOn of ["transition", "active"] as const) {
    const w = makeWorld({ a: "pa", b: "pb" });
    let n = 0;
    w.hooks.beforeFsSet = (_p, d) => { if (d.state === failOn && n++ === 1) throw new Error("boom"); };
    await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
    await assert.rejects(runOp(w.sql, w.fs, "t1"));
    const op = await runOp(w.sql, w.fs, "t1");
    assert.equal(op.step, "done");
    assert.equal((await runOp(w.sql, w.fs, "t1")).step, "done");
  }
});

test("a late retry of an older op cannot overwrite a newer op's doc", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("t1", "link", ["a"], { a: "j1" }, null);
  const stale = await w.sql.getOp("t1");
  // t1 crashes mid-flight after freezing; admin aborts it; a newer op t2 takes over and finishes
  w.hooks.beforeCommit = () => { throw new Error("crash at commit"); };
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /crash at commit/);
  w.hooks.beforeCommit = undefined;
  await abortOp(w.sql, w.fs, "t1");
  await w.sql.reserve("t2", "link", ["a"], { a: "j2" }, null);
  await runOp(w.sql, w.fs, "t2");
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "j2");
  // old process wakes up and retries with its stale op
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /aborted/);
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "j2");
  assert.ok(stale);
});

test("a doc held by another op or pointing at a different space refuses the freeze", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  w.docs.set("u:a.n", { doc: { coupleId: "pa", state: "transition", txId: "other", fence: 3 }, t: 99 });
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /held by another op/);
  const w2 = makeWorld({ a: "pa", b: "pb" });
  w2.docs.set("u:a.n", { doc: { coupleId: "other-space", state: "active", txId: "x", fence: 0 }, t: 99 });
  await w2.sql.reserve("t1", "link", ["a"], { a: "j" }, null);
  await assert.rejects(runOp(w2.sql, w2.fs, "t1"), /does not match the database/);
  assert.deepEqual(w2.accounts.a, "pa");
});

test("a concurrent write between read and freeze (updateTime changed) is refused by the precondition", async () => {
  const w = makeWorld({ a: "pa" });
  w.hooks.beforeFsSet = (pid) => { const d = w.docs.get(pid)!; d.t = 500; }; // someone else wrote after our read
  await w.sql.reserve("t1", "link", ["a"], { a: "j" }, null);
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /updateTime/);
  assert.equal(w.accounts.a, "pa");
});

test("abort restores absence: a pid that had no doc gets none back, frozen pid with a doc gets it back", async () => {
  const w = makeWorld({ a: "pa", b: "pb" }, false);
  w.docs.set("u:a.n", { doc: { coupleId: "pa", state: "active", txId: "seed", fence: 0 }, t: 1 });
  w.hooks.beforeFsSet = (pid, doc) => { if (pid === "u:b.n" && doc.state === "transition") throw new Error("down"); };
  await w.sql.reserve("t1", "link", ["b", "a"], TO, null); // b first: b has no doc
  let calls = 0;
  w.hooks.beforeFsSet = (_p, doc) => { if (doc.state === "transition" && ++calls === 2) throw new Error("down"); };
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /down/);
  w.hooks.beforeFsSet = undefined;
  await abortOp(w.sql, w.fs, "t1");
  assert.equal(w.docs.has("u:b.n"), false);
  assert.equal(w.docs.get("u:a.n")!.doc.state, "active");
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "pa");
  assert.equal(w.locks.size, 0);
});

test("advance is a compare-and-set on step: a step cannot be skipped", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  await assert.rejects(w.sql.advance("t1", 1, "fs_frozen", "aborted"), /stale/);
});

test("abort race: a commit cannot win after the op moved to aborting, and a crash mid-restore resumes", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("t1", "link", ["a", "b"], TO, null);
  w.hooks.beforeCommit = () => { throw new Error("stop before commit"); };
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /stop before commit/);
  w.hooks.beforeCommit = undefined;
  // abort starts: crash during restore of the second doc
  let n = 0; w.hooks.beforeFsSet = (_p, d) => { if (d.state === "active" && ++n === 2) throw new Error("crash mid restore"); };
  await assert.rejects(abortOp(w.sql, w.fs, "t1"), /crash mid restore/);
  assert.equal(w.ops.get("t1")!.step, "aborting");
  assert.equal(w.locks.size, 2);
  await assert.rejects(w.sql.commit("t1", w.ops.get("t1")!.fence), /stale/); // commit is impossible now
  await assert.rejects(runOp(w.sql, w.fs, "t1"), /aborted/);
  w.hooks.beforeFsSet = undefined;
  await abortOp(w.sql, w.fs, "t1"); // resume
  assert.equal(w.ops.get("t1")!.step, "aborted");
  assert.equal(w.docs.get("u:a.n")!.doc.state, "active");
  assert.equal(w.docs.get("u:b.n")!.doc.state, "active");
  assert.deepEqual(w.accounts, { a: "pa", b: "pb" });
});

test("repair: a deterministic commit rejection aborts the op (docs restored, locks released) instead of leaving frozen docs", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("r1", "link", ["a", "b"], TO, null);
  w.hooks.beforeCommit = () => { throw new Error("account moved since reserve"); };
  await assert.rejects(repairOp(w.sql, w.fs, "r1"), /moved since reserve/);
  assert.equal(w.ops.get("r1")!.step, "aborted");
  assert.equal(w.docs.get("u:a.n")!.doc.state, "active");
  assert.equal(w.docs.get("u:a.n")!.doc.coupleId, "pa");
  assert.equal(w.locks.size, 0);
});
test("repair: an op stuck in aborting is routed to abortOp and finishes", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("r2", "link", ["a", "b"], TO, null);
  const o = w.ops.get("r2")!;
  await w.sql.advance("r2", o.fence, "reserved", "aborting");
  const r = await repairOp(w.sql, w.fs, "r2");
  assert.equal(r.step, "aborted");
  assert.equal(w.locks.size, 0);
});

test("lost response: a write that landed but reported a conflict is accepted only if the doc is in the wanted state", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("l1", "link", ["a", "b"], TO, null);
  const realSet = w.fs.set; let first = true;
  w.fs.set = async (pid, doc, pre) => { const r = await realSet(pid, doc, pre); if (first) { first = false; throw new FsConflict("lost response"); } return r; };
  const op = await runOp(w.sql, w.fs, "l1");
  assert.equal(op.step, "done");
});
test("a conflict where the doc is NOT in the wanted state still fails", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await w.sql.reserve("l2", "link", ["a", "b"], TO, null);
  w.fs.set = async () => { throw new FsConflict("other writer"); };
  await assert.rejects(runOp(w.sql, w.fs, "l2"));
  assert.ok(!w.docs.get("u:a.n") || w.docs.get("u:a.n")!.doc.state === "active");
});
test("abort: unknown op is refused; a done op cannot be aborted", async () => {
  const w = makeWorld({ a: "pa", b: "pb" });
  await assert.rejects(abortOp(w.sql, w.fs, "nope"), /unknown op/);
  await w.sql.reserve("d1", "link", ["a", "b"], TO, null);
  await runOp(w.sql, w.fs, "d1");
  await assert.rejects(abortOp(w.sql, w.fs, "d1"), /past commit|stale|aborted/);
});
