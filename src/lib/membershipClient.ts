import { authHeaders } from "./authHeaders";

/** Client for the server-side membership operations and per-item sharing. All go through /api/proxy?op=.
 *  Errors are returned as readable text, never thrown, so stale clients and refused operations show a message instead of corrupting state. */
export type OpResult<T = any> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function op<T = any>(name: string, body: unknown): Promise<OpResult<T>> {
  try {
    const r = await fetch(`/api/proxy?op=${encodeURIComponent(name)}`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body ?? {}) });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j?.success !== false) return { ok: true, data: j };
    const msg = r.status === 401 || r.status === 409 ? (j?.error || "Please sign in again.") : j?.error || `Request failed (${r.status})`;
    return { ok: false, error: String(msg), status: r.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error", status: 0 };
  }
}

export const linkCouple = (partner1: string, partner2: string, coupleName?: string) => op("link-couple", { partner1, partner2, coupleName });
export const unlinkCouple = (coupleId: string) => op("unlink-couple", { coupleId });
export const firestoreProbe = () => op<{ ok: boolean; step: string; detail?: string }>("fs-probe", {});
export const SHAREABLE_TABLES = ["milestones", "date_plans", "memories", "letters", "couple_questions", "celebration_cards"] as const;
export type ShareableTable = (typeof SHAREABLE_TABLES)[number];
/** Share one of MY personal items with my current partner. The owner is always the signed-in account on the server. */
export const shareItem = (table: ShareableTable, itemId: string) => op("share-item", { table, itemId });
export const unshareItem = (table: ShareableTable, itemId: string) => op("unshare-item", { table, itemId });

export const mySharedItems = () => op<{ data: { table: ShareableTable; itemId: string }[] }>("my-shares", {});

/** Admin only. The server creates the account and its solo space atomically and returns the real stored ids and plan. */
export const adminCreateAccount = (username: string, password: string, gender: "male" | "female", plan?: string) =>
  op<{ account: { id: string; username: string; coupleId: string; personalCoupleId: string }; plan: string | null; warnings: string[] }>("admin-create-account", { username, password, gender, plan });
