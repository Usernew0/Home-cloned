import { requireRole } from "./guards.js";
import { resolveMembership } from "./membership.js";

export const SHAREABLE = ["milestones", "date_plans", "memories", "letters", "couple_questions", "celebration_cards"] as const;
const isShareable = (t: string) => (SHAREABLE as readonly string[]).includes(t);
const ITEM_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Reads items partners shared with this account that are effective right now (exact linked pair, no open op). Read-only. */
export async function readSharedItems(db: any, accountId: string, table: string, action: string, locked: boolean): Promise<{ status: number; body: any }> {
  if (action !== "select") return { status: 403, body: { success: false, error: "Shared items are read-only" } };
  if (!isShareable(table)) return { status: 400, body: { success: false, error: "That table cannot be shared" } };
  if (locked) return { status: 409, body: { success: false, error: "Space change in progress, try again in a moment" } };
  const ids = await db.rpc("shared_item_ids", { p_account: accountId, p_table: table });
  if (ids.error) return { status: 503, body: { success: false, error: "Shared items unavailable" } };
  const grants: { item_id: string; owner_space: string }[] = (ids.data || []).filter((g: any) => g && g.item_id && g.owner_space);
  if (!grants.length) return { status: 200, body: { success: true, data: [] } };
  const rows = await db.from(table).select("*").in("id", grants.map((g) => g.item_id));
  if (rows.error) return { status: 503, body: { success: false, error: "Shared items unavailable" } };
  // an item counts only if it still sits in the granting owner's personal space (never moved, never another space's row)
  const ok = new Set(grants.map((g) => `${g.item_id}|${g.owner_space}`));
  const data = (rows.data || []).filter((r: any) => ok.has(`${r.id}|${r.couple_id}`));
  return { status: 200, body: { success: true, data } };
}

export function makeShareHandlers(getDb: () => any) {
  async function run(req: any, res: any, fn: "share_create" | "share_remove") {
    const session = requireRole(req, res, ["user", "partner"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const table = String(req.body?.table || "");
    const itemId = String(req.body?.itemId || "");
    if (!isShareable(table) || !ITEM_ID.test(itemId)) return res.status(400).json({ success: false, error: "Invalid item" });
    const m = await resolveMembership(db, session); // strict pid+nonce match; owner is ALWAYS the session's account, never a request field
    if ("error" in m) return res.status(m.status).json({ success: false, error: m.error });
    if (m.mode !== "v2") return res.status(409).json({ success: false, error: "Sharing is not enabled yet" });
    if (m.locked) return res.status(409).json({ success: false, error: "Space change in progress, try again in a moment" });
    const r = await db.rpc(fn, { p_owner: m.accountId, p_table: table, p_item: itemId });
    if (r.error) {
      const msg = String(r.error.message || "");
      const known = /not linked|not in the owner personal space|partner not in|in progress|bad table|unknown owner/.test(msg);
      return res.status(known ? 409 : 500).json({ success: false, error: known ? msg : "Share failed" });
    }
    return res.json({ success: true, data: r.data });
  }
  async function mine(req: any, res: any) {
    const session = requireRole(req, res, ["user", "partner"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const m = await resolveMembership(db, session);
    if ("error" in m) return res.status(m.status).json({ success: false, error: m.error });
    if (m.mode !== "v2") return res.json({ success: true, data: [], enabled: false });
    const r = await db.rpc("my_effective_shares", { p_owner: m.accountId });
    if (r.error) return res.status(503).json({ success: false, error: "Shares unavailable" });
    return res.json({ success: true, enabled: true, data: (r.data || []).map((x: any) => ({ table: x.item_table, itemId: x.item_id })) });
  }
  return { mine, share: (req: any, res: any) => run(req, res, "share_create"), unshare: (req: any, res: any) => run(req, res, "share_remove") };
}
