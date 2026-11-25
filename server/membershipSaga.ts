/**
 * Space transition saga. SQL holds the durable op record (membership_ops) and the account membership;
 * Firestore members/{pid} is what Firestore rules read. Not atomic across stores. Order:
 *   reserve -> freeze Firestore (verified) -> fs_frozen -> SQL commit -> activate Firestore (verified) -> done.
 * Firestore only supports exists/updateTime preconditions, so ownership (txId) is checked by reading the doc,
 * then the write is conditional on the updateTime that was read.
 */
export type MemberDoc = { coupleId: string; state: "active" | "transition"; txId: string; fence: number; /** what existed before this op froze it, so abort can restore exactly that */ prev?: "absent" | "active" };
export type FsRead = { doc: MemberDoc; updateTime: string } | null;
export type FsPrecondition = { exists: false } | { updateTime: string };
export interface FsStore {
  get(pid: string): Promise<FsRead>;
  /** Throws FsConflict when the precondition does not hold. Returns the new updateTime. */
  set(pid: string, doc: MemberDoc, pre: FsPrecondition): Promise<string>;
  /** Conditional delete (updateTime precondition). */
  del(pid: string, pre: { updateTime: string }): Promise<void>;
}
export class FsConflict extends Error {}
export type Step = "reserved" | "fs_frozen" | "aborting" | "db_committed" | "fs_active" | "done" | "aborted";
export type Op = { txId: string; kind: "link" | "unlink"; accountIds: string[]; from: Record<string, string>; to: Record<string, string>; step: Step; fence: number; tenant: any | null; /** accountId -> full pid ("u:<id>.<nonce>"), the Firestore members doc id */ pids: Record<string, string> };
export interface SqlStore {
  reserve(txId: string, kind: "link" | "unlink", accountIds: string[], to: Record<string, string>, tenant: any | null): Promise<Op>;
  getOp(txId: string): Promise<Op | null>;
  commit(txId: string, fence: number): Promise<void>;
  /** Compare-and-set on (fence, from step). Throws when either differs. */
  advance(txId: string, fence: number, from: Step, to: Step): Promise<number>;
}
const pidFor = (op: Op, accountId: string) => { const p = op.pids?.[accountId]; if (!p) throw new Error(`no permanent id for ${accountId}`); return p; };

async function writeVerified(fs: FsStore, pid: string, doc: MemberDoc, pre: FsPrecondition) {
  try {
    await fs.set(pid, doc, pre);
  } catch (e) {
    // A retry after a lost response: the write may already have landed. Accept only when the doc is exactly in the state this op wants.
    if (!(e instanceof FsConflict)) throw e;
    const now = await fs.get(pid);
    if (!now || now.doc.txId !== doc.txId || now.doc.state !== doc.state || now.doc.coupleId !== doc.coupleId) throw e;
  }
  const back = await fs.get(pid);
  if (!back || back.doc.txId !== doc.txId || back.doc.state !== doc.state || back.doc.coupleId !== doc.coupleId) throw new Error(`readback mismatch for ${pid}`);
}

async function freezeOne(fs: FsStore, op: Op, accountId: string) {
  const pid = pidFor(op, accountId);
  const cur = await fs.get(pid);
  const next: MemberDoc = { coupleId: op.from[accountId], state: "transition", txId: op.txId, fence: op.fence, prev: cur ? "active" : "absent" };
  if (!cur) return writeVerified(fs, pid, next, { exists: false });
  if (cur.doc.txId === op.txId && cur.doc.state === "transition") return; // already frozen by this op (retry)
  if (cur.doc.state === "transition") throw new Error(`${pid} held by another op`);
  if (cur.doc.coupleId !== op.from[accountId]) throw new Error(`${pid} doc space does not match the database`);
  return writeVerified(fs, pid, next, { updateTime: cur.updateTime });
}

async function activateOne(fs: FsStore, op: Op, accountId: string) {
  const pid = pidFor(op, accountId);
  const cur = await fs.get(pid);
  if (!cur) throw new Error(`${pid} member doc missing at activation`);
  if (cur.doc.txId === op.txId && cur.doc.state === "active" && cur.doc.coupleId === op.to[accountId]) return;
  if (cur.doc.txId !== op.txId || cur.doc.state !== "transition") throw new Error(`${pid} no longer owned by ${op.txId}`);
  return writeVerified(fs, pid, { coupleId: op.to[accountId], state: "active", txId: op.txId, fence: op.fence }, { updateTime: cur.updateTime });
}

async function restoreOne(fs: FsStore, op: Op, accountId: string) {
  const pid = pidFor(op, accountId);
  const cur = await fs.get(pid);
  if (!cur || cur.doc.txId !== op.txId || cur.doc.state !== "transition") return; // never frozen by us, nothing to restore
  if (cur.doc.prev === "absent") {
    try { await fs.del(pid, { updateTime: cur.updateTime }); } catch (e) { if (!(e instanceof FsConflict)) throw e; } // already gone is the wanted state; verified below
    if (await fs.get(pid)) throw new Error(`restore of absence failed for ${pid}`);
    return;
  }
  await writeVerified(fs, pid, { coupleId: op.from[accountId], state: "active", txId: op.txId, fence: op.fence }, { updateTime: cur.updateTime });
}

/** Abort is legal only before the SQL commit. Step 1 moves the op to the durable "aborting" step (a compare-and-set that makes commit
 *  impossible), step 2 restores each prior doc (or absence), step 3 releases the locks. A crash in between stays denied and can resume. */
export async function abortOp(sql: SqlStore, fs: FsStore, txId: string) {
  let op = await sql.getOp(txId);
  if (!op) throw new Error("unknown op");
  if (op.step === "aborted") return op;
  if (op.step === "reserved" || op.step === "fs_frozen") {
    await sql.advance(txId, op.fence, op.step, "aborting"); // loses the race cleanly if a commit got there first
    op = (await sql.getOp(txId))!;
  }
  if (op.step !== "aborting") throw new Error("past commit: only forward");
  for (const a of op.accountIds) await restoreOne(fs, op, a);
  await sql.advance(txId, op.fence, "aborting", "aborted");
  return (await sql.getOp(txId))!;
}

/** Runs or resumes an op from its persisted step. Safe to call again after a crash. */
export async function runOp(sql: SqlStore, fs: FsStore, txId: string): Promise<Op> {
  let op = await sql.getOp(txId);
  if (!op) throw new Error("unknown op");
  if (op.step === "aborted" || op.step === "aborting") throw new Error("op was aborted");
  if (op.step === "reserved") {
    for (const a of op.accountIds) await freezeOne(fs, op, a);
    await sql.advance(txId, op.fence, "reserved", "fs_frozen");
    op = (await sql.getOp(txId))!;
  }
  if (op.step === "fs_frozen") {
    await sql.commit(txId, op.fence);
    op = (await sql.getOp(txId))!;
  }
  if (op.step === "db_committed") {
    for (const a of op.accountIds) await activateOne(fs, op, a);
    await sql.advance(txId, op.fence, "db_committed", "fs_active");
    op = (await sql.getOp(txId))!;
  }
  if (op.step === "fs_active") {
    await sql.advance(txId, op.fence, "fs_active", "done");
    op = (await sql.getOp(txId))!;
  }
  return op;
}

// Repair runner entry point: routes an op by its persisted step. "aborting" resumes the abort. If the DB commit is rejected deterministically
// (for example the account moved since reserve) and the op did not commit, the op is aborted so docs are not left frozen. Returns the final op.
export async function repairOp(sql: SqlStore, fs: FsStore, txId: string): Promise<Op> {
  const op = await sql.getOp(txId);
  if (!op) throw new Error("unknown op");
  if (op.step === "aborting" || op.step === "aborted") return abortOp(sql, fs, txId);
  try {
    return await runOp(sql, fs, txId);
  } catch (e) {
    const after = await sql.getOp(txId);
    if (after && (after.step === "reserved" || after.step === "fs_frozen")) {
      await abortOp(sql, fs, txId);
      throw e;
    }
    throw e;
  }
}
