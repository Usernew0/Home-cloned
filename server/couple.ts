import { requireRole } from "./guards.js";
import { COUPLE_TABLES } from "./policy.js";

/**
 * Server-authoritative link / unlink of two accounts.
 *
 * PostgREST has no multi-statement transaction, so this is NOT atomic. What it does guarantee:
 * - everything is validated and the rows to move are read before the first write;
 * - every write is journaled and undone in reverse order if a later write or the final check fails;
 * - success is reported only after a re-read confirms the result;
 * - the result says whether the rollback itself succeeded.
 * A process crash or timeout between writes can still leave a partial state; true atomicity needs a database function.
 */

type Db = any;
type Undo = { label: string; run: () => Promise<any> };

const CHUNK = 100;
const NO_TABLE_CODES = ["42P01", "PGRST205"];
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));
const norm = (v: unknown) => String(v ?? "").toLowerCase().trim();
const SHARED_DEFAULT = "couple_default";

class StepError extends Error {}
function must(label: string, res: { error?: any }) {
  if (res?.error) throw new StepError(`${label}: ${res.error.message || "database error"}`);
}

async function rollback(undos: Undo[]): Promise<{ rolledBack: boolean; rollbackErrors: string[] }> {
  const errors: string[] = [];
  for (const u of [...undos].reverse()) {
    try {
      const res: any = await u.run();
      if (res?.error) errors.push(`${u.label}: ${res.error.message || "database error"}`);
    } catch (e: any) {
      errors.push(`${u.label}: ${e?.message || "failed"}`);
    }
  }
  return { rolledBack: errors.length === 0, rollbackErrors: errors };
}

type MovePlan = Record<string, { id: string; prev: string }[]>;

/** Rows to move to the new space, read before any write. A missing optional table is skipped, any other read error aborts. */
async function planMoves(db: Db, oldIds: string[], usernames: string[], target: string) {
  const plan: MovePlan = {};
  const skipped: string[] = [];
  for (const table of COUPLE_TABLES as readonly string[]) {
    const found = new Map<string, string>();
    const reads: any[] = [];
    if (oldIds.length) reads.push(db.from(table).select("id,couple_id").in("couple_id", oldIds));
    if (table === "letters" && usernames.length) reads.push(db.from(table).select("id,couple_id,sender").in("sender", usernames));
    let skip = false;
    for (const r of reads) {
      const { data, error } = await r;
      if (error) {
        if (NO_TABLE_CODES.includes(error.code)) { skip = true; break; }
        throw new StepError(`read ${table}: ${error.message || "database error"}`);
      }
      for (const row of data || []) if (row.id !== undefined && row.couple_id !== target) found.set(String(row.id), String(row.couple_id ?? ""));
    }
    if (skip) { skipped.push(table); continue; }
    if (found.size) plan[table] = [...found].map(([id, prev]) => ({ id, prev }));
  }
  return { plan, skipped };
}

function groupByPrev(rows: { id: string; prev: string }[]) {
  const g = new Map<string, string[]>();
  for (const r of rows) g.set(r.prev, [...(g.get(r.prev) || []), r.id]);
  return g;
}

export async function linkCoupleWith(db: Db, input: { partner1?: unknown; partner2?: unknown; coupleName?: unknown; plan?: unknown; restoreCoupleId?: unknown }) {
  const p1 = String(input.partner1 ?? "").trim();
  const p2 = String(input.partner2 ?? "").trim();
  if (!p1 || !p2) return { status: 400, body: { success: false, error: "Two user accounts are required." } };
  if (norm(p1) === norm(p2)) return { status: 400, body: { success: false, error: "Partner 1 and Partner 2 must be different accounts." } };

  const undos: Undo[] = [];
  try {
    const accRes = await db.from("user_accounts").select("id,username,couple_id");
    must("read accounts", accRes);
    const accounts: any[] = accRes.data || [];
    const u1 = accounts.find((a) => norm(a.username) === norm(p1));
    const u2 = accounts.find((a) => norm(a.username) === norm(p2));
    if (!u1 || !u2) return { status: 400, body: { success: false, error: "Both accounts must exist before they can be linked. Nothing was changed." } };

    const tenRes = await db.from("couple_tenants").select("*");
    must("read couple spaces", tenRes);
    const tenants: any[] = tenRes.data || [];
    const pair = new Set([norm(u1.username), norm(u2.username)]);
    const joint = tenants.find((t) => pair.has(norm(t.partner1)) && pair.has(norm(t.partner2)) && norm(t.partner1) !== norm(t.partner2));
    // restoreCoupleId reconnects the pair to a space id they used before (e.g. after an unlink), so data still stored under it is reachable again.
    const restore = String(input.restoreCoupleId ?? "").trim();
    if (restore) {
      if (!/^couple_[A-Za-z0-9_]+$/.test(restore) || restore === SHARED_DEFAULT) return { status: 400, body: { success: false, error: "That space id is not valid for restoring." } };
      const other = tenants.find((t) => t.couple_id === restore && !(pair.has(norm(t.partner1)) && pair.has(norm(t.partner2))));
      if (other) return { status: 400, body: { success: false, error: "That space id belongs to a different couple. Nothing was changed." } };
      const holders = accounts.filter((a) => a.couple_id === restore && a.id !== u1.id && a.id !== u2.id);
      if (holders.length) return { status: 400, body: { success: false, error: "Another account already uses that space id. Nothing was changed." } };
    }
    const target: string = restore || joint?.couple_id || `couple_${Date.now()}`;

    if (joint && u1.couple_id === target && u2.couple_id === target) {
      return { status: 200, body: { success: true, alreadyLinked: true, coupleId: target, moved: {}, skippedTables: [], accounts: [{ id: u1.id, coupleId: target }, { id: u2.id, coupleId: target }], tenant: joint } };
    }

    const oldIds = [...new Set([u1.couple_id, u2.couple_id].map((v) => String(v ?? "").trim()).filter((v) => v && v !== SHARED_DEFAULT && v !== target))];
    const { plan, skipped } = await planMoves(db, oldIds, [u1.username, u2.username], target);

    const coupleName = String(input.coupleName ?? "").trim() || `${u1.username} & ${u2.username}`;
    const plan_ = String(input.plan ?? "").trim() || joint?.plan || "free";
    const tenantRow = { couple_id: target, couple_name: joint?.couple_name || coupleName, partner1: joint?.partner1 || u1.username, partner2: joint?.partner2 || u2.username, plan: plan_, created_at: joint?.created_at || new Date().toISOString() };

    // 1. couple space record
    must("save couple space", await db.from("couple_tenants").upsert(tenantRow, { onConflict: "couple_id" }));
    undos.push(joint
      ? { label: "restore couple space", run: () => db.from("couple_tenants").upsert(joint, { onConflict: "couple_id" }) }
      : { label: "remove new couple space", run: () => db.from("couple_tenants").delete().eq("couple_id", target) });

    // 2. both accounts
    for (const u of [u1, u2]) {
      must(`link account ${u.username}`, await db.from("user_accounts").update({ couple_id: target }).eq("id", u.id));
      undos.push({ label: `restore account ${u.username}`, run: () => db.from("user_accounts").update({ couple_id: u.couple_id ?? null }).eq("id", u.id) });
    }

    // 3. data rows, by explicit id
    const moved: Record<string, number> = {};
    for (const [table, rows] of Object.entries(plan)) {
      for (const [prev, ids] of groupByPrev(rows)) {
        for (const part of chunks(ids)) {
          must(`move ${table}`, await db.from(table).update({ couple_id: target }).in("id", part));
          undos.push({ label: `restore ${table}`, run: () => db.from(table).update({ couple_id: prev }).in("id", part) });
        }
      }
      moved[table] = rows.length;
    }

    // 4. verify by re-reading
    const check = await db.from("user_accounts").select("id,couple_id").in("id", [u1.id, u2.id]);
    must("verify accounts", check);
    if ((check.data || []).length !== 2 || (check.data || []).some((r: any) => r.couple_id !== target)) throw new StepError("verify accounts: link not visible after save");
    const tCheck = await db.from("couple_tenants").select("couple_id").eq("couple_id", target);
    must("verify couple space", tCheck);
    if (!(tCheck.data || []).length) throw new StepError("verify couple space: record not visible after save");
    for (const [table, rows] of Object.entries(plan)) {
      for (const part of chunks(rows.map((r) => r.id))) {
        const c = await db.from(table).select("id,couple_id").in("id", part);
        must(`verify ${table}`, c);
        if ((c.data || []).some((r: any) => r.couple_id !== target)) throw new StepError(`verify ${table}: some rows did not move`);
      }
    }

    return { status: 200, body: { success: true, coupleId: target, moved, skippedTables: skipped, accounts: [{ id: u1.id, coupleId: target }, { id: u2.id, coupleId: target }], tenant: tenantRow } };
  } catch (e: any) {
    const rb = await rollback(undos);
    console.error("link-couple failed:", e?.message);
    return { status: 500, body: { success: false, error: `${e instanceof StepError ? e.message : "Unexpected server error"}. ${rb.rolledBack ? "All changes were undone." : "Some changes could NOT be undone. Check the accounts and spaces."}`, rolledBack: rb.rolledBack, rollbackErrors: rb.rollbackErrors } };
  }
}

export async function unlinkCoupleWith(db: Db, input: { coupleId?: unknown; dataPolicy?: unknown }) {
  const coupleId = String(input.coupleId ?? "").trim();
  if (!coupleId) return { status: 400, body: { success: false, error: "A couple space id is required." } };
  const undos: Undo[] = [];
  try {
    const accRes = await db.from("user_accounts").select("id,username,couple_id");
    must("read accounts", accRes);
    const members: any[] = (accRes.data || []).filter((a: any) => a.couple_id === coupleId);
    if (!members.length) return { status: 400, body: { success: false, error: "No account is linked to this space, so there is nothing to unlink. Nothing was changed or deleted." } };
    // Shared data stays reachable only through the space id. Unlinking without an explicit decision would strand it.
    const counts: Record<string, number> = {};
    for (const table of COUPLE_TABLES as readonly string[]) {
      const r = await db.from(table).select("id").eq("couple_id", coupleId).limit(1000);
      if (r.error) {
        if (NO_TABLE_CODES.includes(r.error.code)) continue;
        throw new StepError(`read ${table}: ${r.error.message || "database error"}`);
      }
      if ((r.data || []).length) counts[table] = r.data.length;
    }
    if (Object.keys(counts).length && input.dataPolicy !== "leave-in-place") {
      return { status: 409, body: { success: false, needsDataDecision: true, dataRows: counts, error: "This space still holds shared data. Unlinking would leave it unreachable for both accounts. Nothing was changed." } };
    }
    const tRes = await db.from("couple_tenants").select("*").eq("couple_id", coupleId);
    must("read couple space", tRes);
    const prevTenant = (tRes.data || [])[0];

    const assigned: { id: string; coupleId: string }[] = [];
    for (const u of members) {
      const individual = `couple_${norm(u.username)}_${Date.now()}`;
      must(`unlink account ${u.username}`, await db.from("user_accounts").update({ couple_id: individual }).eq("id", u.id));
      undos.push({ label: `restore account ${u.username}`, run: () => db.from("user_accounts").update({ couple_id: coupleId }).eq("id", u.id) });
      assigned.push({ id: u.id, coupleId: individual });
    }
    if (prevTenant) {
      must("delete couple space", await db.from("couple_tenants").delete().eq("couple_id", coupleId));
      undos.push({ label: "restore couple space", run: () => db.from("couple_tenants").upsert(prevTenant, { onConflict: "couple_id" }) });
    }

    const check = await db.from("user_accounts").select("id,couple_id").in("id", members.map((m) => m.id));
    must("verify accounts", check);
    if ((check.data || []).some((r: any) => r.couple_id === coupleId) || (check.data || []).length !== members.length) throw new StepError("verify accounts: unlink not visible after save");
    if (prevTenant) {
      const t = await db.from("couple_tenants").select("couple_id").eq("couple_id", coupleId);
      must("verify couple space", t);
      if ((t.data || []).length) throw new StepError("verify couple space: record still present after delete");
    }
    return { status: 200, body: { success: true, coupleId, accounts: assigned, removedTenant: !!prevTenant } };
  } catch (e: any) {
    const rb = await rollback(undos);
    console.error("unlink-couple failed:", e?.message);
    return { status: 500, body: { success: false, error: `${e instanceof StepError ? e.message : "Unexpected server error"}. ${rb.rolledBack ? "All changes were undone." : "Some changes could NOT be undone. Check the accounts and spaces."}`, rolledBack: rb.rolledBack, rollbackErrors: rb.rollbackErrors } };
  }
}

export function makeCoupleHandlers(getDb: () => Db | null) {
  const wrap = (fn: (db: Db, body: any) => Promise<{ status: number; body: any }>) => async (req: any, res: any) => {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const out = await fn(db, body);
    return res.status(out.status).json(out.body);
  };
  return { linkCouple: wrap(linkCoupleWith), unlinkCouple: wrap(unlinkCoupleWith) };
}
