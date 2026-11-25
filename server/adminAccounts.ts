import crypto from "node:crypto";
import { requireRole } from "./guards.js";
import { hashPasswordScrypt } from "./auth.js";

const USERNAME = /^[A-Za-z0-9_.-]{3,40}$/;
const PLANS = ["free", "pro", "premium", "enterprise"];

/** Admin-only account creation. The account insert fires the database trigger that gives it a solo personal space and tenant in the SAME statement,
 *  so the account, its personal id and its tenant row exist together or not at all. The reply reports the REAL stored ids and plan read back from the database.
 *  No browser-side tenant or pair writes. Joining a partner is a separate saga call and is never implied here. */
export function makeAdminAccountHandlers(getDb: () => any) {
  async function create(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const gender = req.body?.gender === "female" ? "female" : "male";
    const plan = req.body?.plan === undefined || req.body?.plan === "" ? null : String(req.body.plan).toLowerCase();
    if (!USERNAME.test(username)) return res.status(400).json({ success: false, error: "Invalid username" });
    if (password.length < 6 || password.length > 200) return res.status(400).json({ success: false, error: "Password must be 6-200 characters" });
    if (plan !== null && !PLANS.includes(plan)) return res.status(400).json({ success: false, error: "Unknown plan" });
    const esc = username.replace(/[\\%_]/g, (c) => "\\" + c);
    const dup = await db.from("user_accounts").select("id").ilike("username", esc).limit(1);
    if (dup.error) return res.status(503).json({ success: false, error: "Account check unavailable" });
    if ((dup.data || []).length) return res.status(409).json({ success: false, error: "Username already exists" });
    const id = `user_${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
    // couple_id / personal_couple_id are never accepted from the request: the trigger assigns both. A missing plan stays null => trigger uses 'free'.
    const row: any = { id, username, password: hashPasswordScrypt(password), gender, role: "user", display_name: username };
    if (plan) row.plan = plan;
    const ins = await db.from("user_accounts").insert(row).select("id,username,couple_id,personal_couple_id,plan").single();
    if (ins.error && (String(ins.error.code) === "23505" || /duplicate|unique/i.test(String(ins.error.message || "")))) return res.status(409).json({ success: false, error: "Username already exists" }); // a concurrent create lost the race at the database index
    if (ins.error || !ins.data) return res.status(500).json({ success: false, error: "Account creation failed" });
    const acct = ins.data;
    const tenant = await db.from("couple_tenants").select("couple_id,plan,partner1,partner2").eq("couple_id", acct.personal_couple_id).maybeSingle();
    const prof = await db.from("profiles").upsert({ id, username, display_name: username }, { onConflict: "id" });
    const warnings: string[] = [];
    if (prof.error) warnings.push("profile row not saved");
    if (tenant.error || !tenant.data) warnings.push("solo tenant row not found");
    return res.json({ success: true, account: { id: acct.id, username: acct.username, coupleId: acct.couple_id, personalCoupleId: acct.personal_couple_id }, plan: tenant.data?.plan ?? null, warnings });
  }
  return { create };
}
