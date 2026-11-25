import crypto from "node:crypto";
import { requireRole } from "./guards.js";
import { FsConflict, runOp, repairOp, abortOp, type Op, type SqlStore, type FsStore } from "./membershipSaga.js";
import { isFirestoreRestConfigured, makeFirestoreMembersStore, makeTokenProvider, probeFirestore } from "./firestoreRest.js";

type Db = any;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Supabase RPC adapter for the mem_* functions (service_role only). The SQL derives spaces and ids itself; callers pass account ids or a couple id. */
export function makeRpcSqlStore(db: Db): SqlStore {
  const rpc = async (fn: string, args: any) => { const r = await db.rpc(fn, args); if (r.error) throw new Error(String(r.error.message || r.error.code || "rpc failed").slice(0, 200)); return r.data; };
  const toOp = (row: any): Op => ({
    txId: row.tx_id, kind: row.kind, accountIds: row.account_ids, from: row.from_spaces, to: row.to_spaces, step: row.step, fence: Number(row.fence),
    tenant: { id: row.tenant_id, name: row.tenant_name, pairKey: row.pair_key }, pids: row.pids || {},
  });
  return {
    async reserve(txId, kind, accountIds, _to, tenant) {
      const row = await rpc("mem_reserve", { p_tx: txId, p_kind: kind, p_a: accountIds[0] ?? null, p_b: accountIds[1] ?? null, p_couple: tenant?.coupleId ?? null, p_name: tenant?.name ?? null });
      return toOp(await rpc("mem_get_op", { p_tx: row.tx_id }));
    },
    async getOp(txId) { const d = await rpc("mem_get_op", { p_tx: txId }); return d ? toOp(d) : null; },
    async commit(txId, fence) { await rpc("mem_commit", { p_tx: txId, p_fence: fence }); },
    async advance(txId, fence, from, to) { return Number(await rpc("mem_advance", { p_tx: txId, p_fence: fence, p_from: from, p_to: to })); },
  };
}

export function makeFsFromEnv(env: Record<string, string | undefined> = process.env, fetchImpl: any = (globalThis as any).fetch) {
  if (!isFirestoreRestConfigured(env)) return null;
  const token = makeTokenProvider(env, fetchImpl);
  const project = env.FIREBASE_PROJECT_ID || undefined;
  return { store: makeFirestoreMembersStore({ fetch: fetchImpl, token, project }) as FsStore, probe: () => probeFirestore({ fetch: fetchImpl, token, project }) };
}

/** Writes members/{pid} for accounts that have none (state active, current couple id). Existing docs are never touched (create-if-absent only).
 *  Default is a DRY RUN that only counts. apply=true requires a passing scratch probe first. Returns counts, never ids or secrets. */
export async function backfillWith(db: Db, f: { store: FsStore; probe: () => Promise<{ ok: boolean; step: string }> } | null, input: any) {
  if (!f) return fail(503, "Firestore service account is not configured.");
  const accs = await db.from("user_accounts").select("id,couple_id,pid_nonce");
  if (accs.error) return fail(503, "Could not read accounts.");
  const rows = (accs.data || []).filter((a: any) => a.id && a.pid_nonce && a.couple_id);
  const skippedNoSpace = (accs.data || []).length - rows.length;
  let present = 0, missing = 0, mismatched = 0; const todo: any[] = [];
  for (const a of rows) {
    const pid = `u:${a.id}.${a.pid_nonce}`;
    const cur = await f.store.get(pid);
    if (!cur) { missing++; todo.push({ pid, coupleId: a.couple_id }); }
    else if (cur.doc.coupleId !== a.couple_id) mismatched++;
    else present++;
  }
  if (input?.apply !== true) return { status: 200, body: { success: true, dryRun: true, accounts: rows.length, present, missing, mismatched, skippedNoSpace } };
  const probe = await f.probe();
  if (!probe.ok) return fail(409, `Firestore probe failed at step ${probe.step}; nothing was written.`);
  let created = 0, raced = 0;
  for (const t of todo) {
    try { await f.store.set(t.pid, { coupleId: t.coupleId, state: "active", txId: "backfill", fence: 0 }, { exists: false }); created++; }
    catch (e) { if (e instanceof FsConflict) raced++; else return fail(500, `Backfill stopped after ${created} docs: ${safeMsg(e)}`); }
  }
  return { status: 200, body: { success: true, dryRun: false, created, raced, present, mismatched, skippedNoSpace } };
}

const fail = (status: number, error: string) => ({ status, body: { success: false, error } });
const safeMsg = (e: any) => String(e?.message || "").replace(/[^\x20-\x7e]/g, " ").slice(0, 160);

export async function linkWith(db: Db, fs: FsStore | null, input: any, newTx = () => `tx_${crypto.randomUUID()}`) {
  if (!fs) return fail(503, "Firestore membership store is not configured. Nothing was changed.");
  const p1 = norm(input.partner1), p2 = norm(input.partner2);
  if (!p1 || !p2 || p1 === p2) return fail(400, "Two different user accounts are required.");
  const accs = await db.from("user_accounts").select("id,username");
  if (accs.error) return fail(503, "Could not read accounts. Nothing was changed.");
  const a = (accs.data || []).find((x: any) => norm(x.username) === p1), b = (accs.data || []).find((x: any) => norm(x.username) === p2);
  if (!a || !b) return fail(400, "Both accounts must exist. Nothing was changed.");
  const sql = makeRpcSqlStore(db); const tx = newTx();
  try {
    await sql.reserve(tx, "link", [a.id, b.id], {}, { name: typeof input.coupleName === "string" ? input.coupleName.slice(0, 120) : null });
  } catch (e: any) { return fail(409, `Link refused: ${safeMsg(e)}. Nothing was changed.`); }
  return finish(sql, fs, tx);
}

export async function unlinkWith(db: Db, fs: FsStore | null, input: any, newTx = () => `tx_${crypto.randomUUID()}`) {
  if (!fs) return fail(503, "Firestore membership store is not configured. Nothing was changed.");
  const coupleId = String(input.coupleId ?? "").trim();
  if (!coupleId) return fail(400, "coupleId is required.");
  const sql = makeRpcSqlStore(db); const tx = newTx();
  try { await sql.reserve(tx, "unlink", [], {}, { coupleId }); } catch (e: any) { return fail(409, `Unlink refused: ${safeMsg(e)}. Nothing was changed.`); }
  return finish(sql, fs, tx);
}

async function finish(sql: SqlStore, fs: FsStore, tx: string) {
  try {
    const op = await repairOp(sql, fs, tx);
    return { status: 200, body: { success: true, txId: tx, step: op.step, accounts: op.accountIds.length } };
  } catch (e: any) {
    const op = await sql.getOp(tx).catch(() => null);
    // A committed op is resumable by the repair path; an uncommitted one has been aborted by repairOp. Both are reported, never hidden.
    return fail(500, `Membership change did not finish (state: ${op?.step ?? "unknown"}). ${op && op.step === "aborted" ? "It was undone." : "It will be resumed or aborted by repair; do not retry blindly."} ${safeMsg(e)}`);
  }
}

export function makeMembershipHandlers(getDb: () => Db | null, getFs: () => ReturnType<typeof makeFsFromEnv> = () => makeFsFromEnv()) {
  const wrap = (fn: (db: Db, fsx: ReturnType<typeof makeFsFromEnv>, body: any) => Promise<{ status: number; body: any }>) => async (req: any, res: any) => {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const out = await fn(db, getFs(), body);
    return res.status(out.status).json(out.body);
  };
  return {
    linkCouple: wrap((db, f, b) => linkWith(db, f?.store ?? null, b)),
    unlinkCouple: wrap((db, f, b) => unlinkWith(db, f?.store ?? null, b)),
    fsProbe: wrap(async (_db, f) => (f ? { status: 200, body: { success: true, ...(await f.probe()) } } : fail(503, "Firestore service account is not configured."))),
    backfill: wrap((db, f, b) => backfillWith(db, f, b)),
    abort: wrap(async (db, f, b) => { if (!f) return fail(503, "Firestore service account is not configured."); try { const op = await abortOp(makeRpcSqlStore(db), f.store, String(b.txId || "")); return { status: 200, body: { success: true, step: op.step } }; } catch (e: any) { return fail(409, safeMsg(e)); } }),
  };
}
