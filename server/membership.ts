import { COUPLE_TABLES } from "./policy.js";
import { pidAccountId } from "./participant.js";

/**
 * Current-membership check for the database proxy. The session's coupleId is only a hint: the account's live row decides.
 * Data tables default to the account's PERSONAL space (reads and every new write); body.space = "joint" targets the current joint
 * space explicitly. Chat and the tenant/account tables keep the current space (1:1 chat history follows the pids, see policy.ts).
 * Before the cutover (membership_config absent or enabled=false) the proxy keeps the old behavior ("legacy"); once enabled every error fails closed.
 */
export type Membership =
  | { mode: "legacy" }
  | { mode: "v2"; accountId: string; current: string; personal: string | null; locked: boolean };
export type Resolution = { ok: true; coupleId: string; mode: "legacy" | "personal" | "joint" | "current" } | { ok: false; status: number; error: string };

const SCHEMA_ABSENT = new Set(["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"]);
export const PERSONAL_TABLES = (COUPLE_TABLES as readonly string[]).filter((t) => t !== "chat_messages");

/** Explicit cutover switch: the user-run SQL creates membership_config and flips enabled=true only after verification.
 *  Table absent => the SQL has not been applied, legacy behavior. Row present and enabled => strict: every error fails closed. */
// Code-owned latch: MEMBERSHIP_V2=1 in the deployment env is the authority once cutover happens. With it on, a missing table, missing row,
// unreadable row, or enabled=false is a 503 and never legacy, so dropping or rolling back the DB config cannot reopen legacy scope.
// With it off, legacy applies only while the DB config is also off or absent; a DB config that says enabled=true with env off is refused (503, mismatched release).
export async function membershipEnabled(db: any, env: Record<string, string | undefined> = process.env): Promise<boolean | { error: string; status: number }> {
  const latched = String(env.MEMBERSHIP_V2 || "").trim() === "1";
  const r = await db.from("membership_config").select("enabled").eq("id", 1).maybeSingle();
  if (r.error) {
    if (!latched && SCHEMA_ABSENT.has(String(r.error.code || ""))) return false;
    return { error: "Membership check unavailable", status: 503 };
  }
  const on = r.data?.enabled === true;
  if (latched) return on ? true : { error: "Membership check unavailable", status: 503 };
  if (!r.data) return false;
  return on ? { error: "Membership check unavailable", status: 503 } : false;
}

export async function resolveMembership(db: any, session: { pid?: string }): Promise<Membership | { error: string; status: number }> {
  const pid = session.pid || "";
  const on = await membershipEnabled(db, process.env);
  if (typeof on === "object") return on;
  if (!on) return { mode: "legacy" };
  // Enabled: strict. Only user-account pids hold spaces. Missing or unknown pids are refused (admins never reach this function).
  if (!pid.startsWith("u:")) return { error: "Sign in again", status: 401 };
  const accountId = pidAccountId(pid);
  const acc = await db.from("user_accounts").select("id,couple_id,personal_couple_id,pid_nonce").eq("id", accountId).maybeSingle();
  if (acc.error) return { error: "Membership check unavailable", status: 503 };
  const row = acc.data;
  if (!row || `u:${row.id}.${row.pid_nonce}` !== pid) return { error: "Account not found; sign in again", status: 409 };
  const lock = await db.from("membership_op_locks").select("account_id").eq("account_id", accountId).maybeSingle();
  if (lock.error) return { error: "Membership check unavailable", status: 503 };
  return { mode: "v2", accountId, current: row.couple_id || "", personal: row.personal_couple_id ?? null, locked: !!lock.data };
}

export function chooseSpace(m: Membership, table: string, space: unknown, sessionCoupleId: string, action: string = "select"): Resolution {
  if (m.mode === "legacy") {
    if (space !== undefined && space !== "personal") return { ok: false, status: 409, error: "Spaces are not enabled yet; reload the app" };
    return { ok: true, coupleId: sessionCoupleId, mode: "legacy" };
  }
  if (m.locked) return { ok: false, status: 409, error: "Space change in progress, try again in a moment" };
  if (space !== undefined && space !== "personal" && space !== "joint") return { ok: false, status: 400, error: "Invalid space" };
  if (!m.current) return { ok: false, status: 409, error: "Account has no space; sign in again" };
  if (!PERSONAL_TABLES.includes(table)) {
    if (space === "personal" || space === "joint") return { ok: false, status: 400, error: "That table has no personal/joint choice" };
    return { ok: true, coupleId: m.current, mode: "current" };
  }
  if (space === "joint") {
    // The joint space is read-only for new data: private by default, sharing is an explicit per-item grant, never a write into the joint space.
    if (action !== "select") return { ok: false, status: 403, error: "New items are private; share them with your partner instead" };
    if (!m.personal || m.current === m.personal) return { ok: false, status: 400, error: "No joint space is linked" };
    return { ok: true, coupleId: m.current, mode: "joint" };
  }
  // Strict mode never falls back to the current space: an account without a personal space must sign in again (no silent write into a joint space).
  if (!m.personal) return { ok: false, status: 409, error: "No personal space; sign in again" };
  return { ok: true, coupleId: m.personal, mode: "personal" };
}
