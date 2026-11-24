import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerSession, createTemporaryAuthPassword, hashPasswordScrypt, isSessionSecretConfigured, needsRehash, verifyPassword } from "./auth.js";
import { consumeBackupCode, verifyTotp } from "./totp.js";
import { mintFirebaseToken } from "./firebaseToken.js";
import { makePid, resolveUsernamePid, pidAccountId, userPid, adminPid, newNonce } from "./participant.js";
import { sessionMatchesIdentity } from "./participant.js";
import { authorizeProxy, stripColumns, isGlobalChatRow, visibleChatRow, isDirectChatRow, chatVisibilityOr, type Authorized, type Denied } from "./policy.js";
import { clearFailures, isBlocked, recordFailure } from "./ratelimit.js";
import { requireRole, sessionFromRequest } from "./guards.js";
import { resolveServerSupabaseKey } from "./serverKey.js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = resolveServerSupabaseKey();
/** Server clients never keep a user session: a session stored on the shared client would replace the service key on later requests (they would run as that user). */
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;
export const supabaseAdmin = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, NO_SESSION) : null;


const PRIVILEGED_SETTING_IDS = ["adminAccounts", "credentials"];

/** Admin accounts are stored in different places depending on schema age; read every known shape. */
export function readAdminAccounts(row: any): any[] {
  if (!row) return [];
  const candidates = [row.admin_accounts, row.adminAccounts, row.visible_tabs?.adminAccounts, row.visibleTabs?.adminAccounts];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  if (typeof row.password === "string" && row.password.startsWith("[")) {
    try {
      const parsed = JSON.parse(row.password);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON */
    }
  }
  return [];
}

/** Build the update payload that writes accounts back to the same place they were read from. */
export function adminAccountsPatch(row: any, accounts: any[]): Record<string, any> {
  if (row && "admin_accounts" in row && Array.isArray(row.admin_accounts) && row.admin_accounts.length) return { admin_accounts: accounts };
  if (row && Array.isArray(row.adminAccounts) && row.adminAccounts.length) return { adminAccounts: accounts };
  if (row?.visible_tabs?.adminAccounts) return { visible_tabs: { ...row.visible_tabs, adminAccounts: accounts } };
  if (typeof row?.password === "string" && row.password.startsWith("[")) return { password: JSON.stringify(accounts) };
  return { admin_accounts: accounts };
}

function pick(obj: any, camel: string, snake: string) {
  return obj?.[camel] ?? obj?.[snake];
}


const HASH_PREFIXES = ["scrypt_v1:", "sha256_v1:"];
const isHashed = (v: unknown) => typeof v === "string" && HASH_PREFIXES.some((p) => v.startsWith(p));
/** Browsers send plaintext over TLS; the server is the only place that hashes. */
const toStoredPassword = (v: string) => (isHashed(v) ? v : hashPasswordScrypt(v));
const TWO_FACTOR_KEYS = ["twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes", "twoFactorCreatedAt"];

/** Remove password hashes and 2FA secrets from an admin_settings row before it reaches any browser. */
export function redactAdminRow(row: any): any {
  if (!row) return row;
  const out: any = omit(row, ["password", "two_factor_secret", "two_factor_backup_codes"]);
  if (row.id === "adminAccounts") {
    // Always emit one normalized, redacted list regardless of the stored shape (column, visible_tabs or JSON-in-password).
    const redact = (a: any) => ({ ...omit(a, ["password", "twoFactorSecret", "twoFactorBackupCodes"]), hasPassword: !!a.password });
    const list = readAdminAccounts(row).map(redact);
    out.admin_accounts = list;
    out.adminAccounts = list;
    if (out.visible_tabs && typeof out.visible_tabs === "object") out.visible_tabs = omit(out.visible_tabs, ["adminAccounts"]);
  }
  if (row.id === "credentials") out.hasPassword = !!row.password;
  return out;
}

/** Lazily gives an existing admin account (saved before nonces existed) its server-generated nonce. Best effort: on failure the admin has no
 *  private-chat id (empty pid) rather than a weaker one. Returns the pid, or "". */
async function mintAdminNonce(id: string): Promise<string> {
  try {
    if (!id || !supabaseAdmin) return "";
    const { data: row } = await supabaseAdmin.from("admin_settings").select("*").eq("id", "adminAccounts").maybeSingle();
    if (!row) return "";
    const accounts = readAdminAccounts(row);
    const idx = accounts.findIndex((a: any) => String(a.id) === id);
    if (idx < 0) return "";
    if (!accounts[idx].pidNonce) {
      accounts[idx] = { ...accounts[idx], pidNonce: newNonce() };
      const { error } = await supabaseAdmin.from("admin_settings").update(adminAccountsPatch(row, accounts)).eq("id", "adminAccounts");
      if (error) return "";
      const { data: again } = await supabaseAdmin.from("admin_settings").select("*").eq("id", "adminAccounts").maybeSingle();
      return adminPid(readAdminAccounts(again).find((a: any) => String(a.id) === id));
    }
    return adminPid(accounts[idx]);
  } catch { return ""; }
}

/** Merge a browser-supplied admin accounts list with what is stored: keep stored hashes/2FA, hash new plaintext. */
export function mergeAdminAccounts(existing: any[], incoming: any[]): { accounts: any[]; error?: string } {
  const byId = new Map(existing.map((a) => [a.id, a]));
  const accounts: any[] = [];
  for (const a of incoming) {
    if (!a || typeof a !== "object" || typeof a.id !== "string" || typeof a.username !== "string" || !a.username.trim()) return { accounts: [], error: "Invalid admin account" };
    const prev = byId.get(a.id);
    const next: any = omit(a, ["hasPassword", "pidNonce", ...TWO_FACTOR_KEYS]);
    next.pidNonce = prev?.pidNonce || newNonce(); // server-generated, never taken from the browser
    if (typeof a.password === "string" && a.password) next.password = toStoredPassword(a.password);
    else if (prev?.password) next.password = prev.password;
    else return { accounts: [], error: `Admin account "${a.username}" needs a password` };
    for (const k of TWO_FACTOR_KEYS) if (prev && prev[k] !== undefined) next[k] = prev[k];
    accounts.push(next);
  }
  if (accounts.length === 0) return { accounts: [], error: "At least one admin account is required" };
  return { accounts };
}

const SAFE_SETTING_OMIT = ["password", "username", "adminAccounts", "admin_accounts", "credentials", "two_factor_secret", "two_factor_backup_codes"];

function omit(row: any, keys: string[]) {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
}

export async function adminSettingsGet(req: any, res: any) {
  const session = requireRole(req, res, ["admin", "partner", "user", "guest"]);
  if (!session) return;
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const { data, error } = await supabaseAdmin.from("admin_settings").select("*");
    if (error) return res.status(500).json({ success: false, error: error.message });
    const settings = (data || [])
      .filter((s: any) => session.role === "admin" || !PRIVILEGED_SETTING_IDS.includes(s.id))
      .map((s: any) => (session.role === "admin" ? redactAdminRow(s) : omit(s, SAFE_SETTING_OMIT)));
    return res.json({ success: true, settings });
  } catch (err: any) {
    console.error("admin-settings read failed:", err?.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function adminSettingsPost(req: any, res: any) {
  const session = requireRole(req, res, ["admin"]);
  if (!session) return;
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const setting = req.body;
    if (!setting || typeof setting !== "object" || Array.isArray(setting) || typeof setting.id !== "string" || !setting.id) {
      return res.status(400).json({ success: false, error: "A setting object with an id is required" });
    }
    let toWrite: any = setting;
    if (setting.id === "adminAccounts" || setting.id === "credentials") {
      const { data: existingRow, error: readError } = await supabaseAdmin.from("admin_settings").select("*").eq("id", setting.id).maybeSingle();
      if (readError) return res.status(500).json({success:false, error:"Could not verify existing credentials; nothing was saved"});
      if (setting.id === "adminAccounts") {
        const incoming = readAdminAccounts(setting);
        const merged = mergeAdminAccounts(readAdminAccounts(existingRow), incoming);
        if (merged.error) return res.status(400).json({ success: false, error: merged.error });
        const clean = omit(setting, ["password", "admin_accounts", "adminAccounts", "visible_tabs", "visibleTabs", "two_factor_secret", "two_factor_backup_codes"]);
        toWrite = { ...clean, ...adminAccountsPatch(existingRow || setting, merged.accounts) };
      } else {
        toWrite = omit(setting, ["two_factor_secret", "two_factor_backup_codes", "twoFactorSecret", "twoFactorBackupCodes", "twoFactorEnabled", "two_factor_enabled", "hasPassword"]);
        if (typeof setting.password === "string" && setting.password) toWrite.password = toStoredPassword(setting.password);
        else if (existingRow?.password) toWrite.password = existingRow.password;
        else delete toWrite.password;
      }
    }
    const { error } = await supabaseAdmin.from("admin_settings").upsert(toWrite);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("admin-settings write failed:", err?.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

/** Live lookup of the account's global-lounge switch (default open). Only user accounts have one; a failed lookup fails closed. */
async function globalLoungeOpen(session: any): Promise<boolean> {
  const pid: string = session?.pid || "";
  if (!pid.startsWith("u:")) return true;
  const { data, error } = await supabaseAdmin!.from("user_accounts").select("*").eq("id", pidAccountId(pid)).maybeSingle();
  if (error || !data || userPid(data) !== pid) return false; // stale session (account recreated): nothing is open for it
  return data.enable_global_chat !== false;
}

/** Single entry for /api/proxy: two small endpoints share it so the deployment stays within the 12-function limit of the Vercel plan. */
export async function proxyEntry(req: any, res: any) {
  const raw = req.query?.op;
  if (raw === undefined || raw === "") return proxy(req, res); // the normal database proxy
  if (raw === "refresh-token") return refreshFirebaseToken(req, res);
  if (raw === "resolve-participant") return resolveParticipant(req, res);
  return res.status(400).json({ success: false, error: "Unknown operation" });
}

export async function proxy(req: any, res: any) {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ success: false, error: "Authentication required" });

  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });

    const decision = authorizeProxy(session, req.body || {});
    if (decision.ok === false) return res.status((decision as Denied).status).json({ success: false, error: (decision as Denied).error });
    const auth = decision as Authorized;

    const query: any = supabaseAdmin.from(auth.table);
    const applyFilters = (q: any) => {
      for (const f of auth.filters) {
        if (f.operator === "eq") q = q.eq(f.column, f.value);
        else if (f.operator === "neq") q = q.neq(f.column, f.value);
        else if (f.operator === "ilike") q = q.ilike(f.column, f.value);
        else if (f.operator === "in") q = q.in(f.column, f.value);
      }
      return q;
    };

    if (auth.action === "select") {
      let q: any = query.select(auth.select, auth.count ? { count: auth.count, head: auth.head } : undefined);
      q = applyFilters(q);
      // DB-level visibility so limit/count/single/pagination all see the same rows (the post-filter below is a second layer).
      const loungeOpen = auth.chatViewer !== undefined ? await globalLoungeOpen(session) : true;
      if (auth.chatViewer !== undefined) q = q.or(chatVisibilityOr(auth.chatViewer, loungeOpen));
      if (auth.notIn?.length) q = q.not("id", "in", `(${auth.notIn.join(",")})`);
      if (auth.order) q = q.order(auth.order.column, { ascending: auth.order.ascending });
      if (auth.limit) q = q.limit(auth.limit);
      if (auth.single) q = q.single();
      const result = await q;
      let out = result.error ? null : stripColumns(result.data, auth.stripColumns);
      if (out && auth.chatViewer !== undefined) {
        // Direct messages are private to their two participants even inside a couple.
        out = Array.isArray(out) ? out.filter((r: any) => visibleChatRow(r, auth.chatViewer!, loungeOpen)) : (visibleChatRow(out, auth.chatViewer, loungeOpen) ? out : null);
        if (Array.isArray(out) && auth.count && !auth.head) result.count = out.length;
        if (out && auth.chatStripCols?.length) {
          const strip = (r: any) => { const c = { ...r }; for (const k of auth.chatStripCols!) delete c[k]; return c; };
          out = Array.isArray(out) ? out.map(strip) : strip(out);
        }
      }
      if (out && auth.table === "admin_settings") out = Array.isArray(out) ? out.map(redactAdminRow) : redactAdminRow(out);
      return res.json({ success: !result.error, data: out, error: result.error?.message, count: result.count });
    }

    if (auth.action === "insert" || auth.action === "upsert") {
      const rows: any[] = Array.isArray(auth.data) ? auth.data : [auth.data];
      if (auth.table === "chat_messages" && session.role !== "admin" && rows.some((r: any) => isGlobalChatRow(r)) && !(await globalLoungeOpen(session))) {
        return res.status(403).json({ success: false, error: "The global lounge is closed for this account" });
      }

      // A non-admin must never overwrite a row that belongs to another couple.
      if (auth.ownershipCheckIds.length) {
        const key = auth.onConflict || "id";
        if (key === "id") {
          const { data: existing, error } = await supabaseAdmin.from(auth.table).select(auth.table === "chat_messages" ? "id,couple_id,sender,receiver,conversation_id,sender_id,receiver_id" : "id,couple_id").in("id", auth.ownershipCheckIds);
          if (error) return res.status(500).json({ success: false, error: "Ownership check failed" });
          if (session.role !== "admin" && (existing || []).some((r: any) => r.couple_id && r.couple_id !== session.coupleId)) {
            return res.status(403).json({ success: false, error: "Record belongs to another account" });
          }
          if (auth.chatDirectGuard && (existing || []).some((r: any) => isDirectChatRow(r) && !visibleChatRow(r, session.pid || ""))) {
            return res.status(403).json({ success: false, error: "Record belongs to another account" });
          }
          if (auth.chatSenderCheck && (existing || []).some((r: any) => r.sender_id !== auth.chatSenderCheck)) {
            return res.status(403).json({ success: false, error: "Record belongs to another account" });
          }
        }
      }

      let payload: any = Array.isArray(auth.data) ? rows.map((r) => ({ ...r })) : { ...rows[0] };
      if (auth.table === "user_accounts") {
        // Admin-created/edited users: plaintext is hashed here; an absent/blank password leaves the stored one untouched.
        const fix = (r: any) => {
          if (typeof r.password === "string" && r.password) r.password = toStoredPassword(r.password);
          else delete r.password;
        };
        for (const r of Array.isArray(payload) ? payload : [payload]) fix(r);
        if (auth.action === "insert" && (Array.isArray(payload) ? payload : [payload]).some((r: any) => !r.password)) {
          return res.status(400).json({ success: false, error: "A password is required for new accounts" });
        }
      }
      let lastError = "";
      for (let attempt = 0; attempt < 6; attempt++) {
        // Admin chat upserts never overwrite an existing row (ON CONFLICT DO NOTHING is atomic; no check-then-write window).
        const opts = auth.table === "chat_messages" && auth.chatDirectGuard && auth.action === "upsert" ? { onConflict: "id", ignoreDuplicates: true } : auth.action === "upsert" && auth.onConflict ? { onConflict: auth.onConflict } : undefined;
        let q: any = query[auth.action](payload, opts);
        q = q.select();
        const result = await q;
        if (!result.error) {
          let written: any = stripColumns(result.data, auth.stripColumns);
          // Never echo back a 1:1 message the caller is not part of (an upsert returns the merged row).
          if (auth.chatReturnViewer !== undefined && Array.isArray(written)) written = written.filter((r: any) => visibleChatRow(r, auth.chatReturnViewer!));
          return res.json({ success: true, data: written });
        }
        lastError = result.error.message || String(result.error);

        // Tolerate columns missing from an older schema, but never drop the tenant column.
        const col = lastError.match(/Could not find the '([^']+)' column/i)?.[1];
        const target = Array.isArray(payload) ? payload[0] : payload;
        if (col && !["couple_id", "id", "pid_nonce", "enable_global_chat", "sender_id", "receiver_id", "author_id"].includes(col) && target && col in target) {
          for (const r of Array.isArray(payload) ? payload : [payload]) delete r[col];
          continue;
        }
        break;
      }
      return res.json({ success: false, error: lastError });
    }

    if (auth.chatDirectGuard && (auth.action === "update" || auth.action === "delete")) {
      // An admin may moderate global/group messages but never touch someone else's 1:1 message.
      const { data: targets, error: tErr } = await applyFilters(supabaseAdmin.from("chat_messages").select("id,sender,receiver,conversation_id,sender_id,receiver_id"));
      if (tErr) return res.status(500).json({ success: false, error: "Ownership check failed" });
      if ((targets || []).some((r: any) => isDirectChatRow(r) && !visibleChatRow(r, session.pid || ""))) {
        return res.status(403).json({ success: false, error: "Record belongs to another account" });
      }
    }

    // Atomic second layer for admin chat writes: the database itself only touches rows the admin may see (non-1:1 rows or their own).
    const adminChatScope = (q: any) => (auth.chatDirectGuard ? q.or(chatVisibilityOr(session.pid || "")) : q);

    if (auth.action === "update") {
      const upd: any = { ...auth.data };
      if (auth.table === "user_accounts" && !auth.selfProfile) {
        if (typeof upd.password === "string" && upd.password) upd.password = toStoredPassword(upd.password);
        else delete upd.password;
      }
      const result = await adminChatScope(applyFilters(query.update(upd)));
      return res.json({ success: !result.error, error: result.error?.message });
    }

    // delete
    const result = await adminChatScope(applyFilters(query.delete()));
    return res.json({ success: !result.error, error: result.error?.message });
  } catch (err: any) {
    console.error("Supabase proxy execution error:", err?.message);
    return res.status(500).json({ success: false, error: "Server error in database proxy" });
  }
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function clientKey(req: any, username: string) {
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  return `${ip}|${username}`;
}

export async function verifyLogin(req: any, res: any) {
  try {
    if (!isSessionSecretConfigured()) {
      console.error("verify-login refused: SERVER_SESSION_SECRET is not configured");
      return res.status(500).json({ success: false, error: "Server is not configured for sign-in" });
    }
    const { username, password, totp, backupCode } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      return res.status(400).json({ success: false, error: "Please enter your name and secret password" });
    }
    if (username.length > 128 || password.length > 256) {
      return res.status(400).json({ success: false, error: "Invalid credentials" });
    }

    const cleanUser = username.trim().toLowerCase();
    const limiterKey = clientKey(req, cleanUser);
    if (isBlocked(limiterKey)) {
      return res.status(429).json({ success: false, error: "Too many attempts. Try again later." });
    }
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });

    // Fetch only the rows that can match this username (not every account).
    const like = escapeLike(cleanUser);
    const [adminRes, byName, byId] = await Promise.all([
      supabaseAdmin.from("admin_settings").select("*").in("id", ["adminAccounts", "credentials"]),
      supabaseAdmin.from("user_accounts").select("*").ilike("username", like),
      supabaseAdmin.from("user_accounts").select("*").in("id", [cleanUser, `user_${cleanUser}`]),
    ]);
    if (adminRes.error || byName.error || byId.error) {
      console.error("verify-login lookup failed:", adminRes.error?.message || byName.error?.message || byId.error?.message);
      return res.status(500).json({ success: false, error: "Authentication error" });
    }
    const adminRows = adminRes.data || [];
    const userRows = [...(byName.data || []), ...(byId.data || [])];

    let isAuthorized = false;
    let authenticatedUsername = username.trim();
    let authenticatedAccountId = "";
    let authenticatedPid = "";
    let authenticatedGlobalChat = true;
    let authenticatedCoupleId = "couple_default";
    let authenticatedRole: "admin" | "partner" | "guest" | "user" = "user";
    let upgradeUserId: string | null = null;
    // Two-factor material of the matched account (checked server-side; the browser never receives it).
    let twoFactor: { enabled: boolean; secret: string; backupCodes: string[]; save: (codes: string[]) => Promise<void> } | null = null;

    const adminAccounts = readAdminAccounts(adminRows.find((s: any) => s.id === "adminAccounts"));
    const matchingAdmin = adminAccounts.find((a: any) => a.username?.toLowerCase().trim() === cleanUser);
    if (matchingAdmin?.password && (await verifyPassword(password, matchingAdmin.password))) {
      isAuthorized = true;
      authenticatedUsername = matchingAdmin.username;
      authenticatedAccountId = String(matchingAdmin.id || "");
      authenticatedPid = adminPid(matchingAdmin) || (await mintAdminNonce(String(matchingAdmin.id || "")));
      authenticatedCoupleId = matchingAdmin.coupleId || matchingAdmin.couple_id || "couple_default";
      authenticatedRole = "admin";
      if (matchingAdmin.twoFactorEnabled && matchingAdmin.twoFactorSecret) {
        const adminRow = adminRows.find((r: any) => r.id === "adminAccounts");
        twoFactor = {
          enabled: true,
          secret: matchingAdmin.twoFactorSecret,
          backupCodes: matchingAdmin.twoFactorBackupCodes || [],
          save: async (codes) => {
            const updated = adminAccounts.map((a: any) => (a.id === matchingAdmin.id ? { ...a, twoFactorBackupCodes: codes } : a));
            const { error } = await supabaseAdmin!.from("admin_settings").update(adminAccountsPatch(adminRow, updated)).eq("id", "adminAccounts");
            if (error) throw new Error(error.message);
          },
        };
      }
    }

    const legacyCreds = adminRows.find((s: any) => s.id === "credentials");
    if (!isAuthorized && adminAccounts.length === 0 && legacyCreds?.username?.toLowerCase().trim() === cleanUser && legacyCreds.password && (await verifyPassword(password, legacyCreds.password))) {
      isAuthorized = true;
      authenticatedUsername = legacyCreds.username;
      authenticatedAccountId = String(legacyCreds.id || "");
      authenticatedPid = makePid("leg", legacyCreds.id);
      authenticatedCoupleId = legacyCreds.coupleId || legacyCreds.couple_id || "couple_default";
      authenticatedRole = "admin";
      if (pick(legacyCreds, "twoFactorEnabled", "two_factor_enabled") && pick(legacyCreds, "twoFactorSecret", "two_factor_secret")) {
        twoFactor = {
          enabled: true,
          secret: pick(legacyCreds, "twoFactorSecret", "two_factor_secret"),
          backupCodes: pick(legacyCreds, "twoFactorBackupCodes", "two_factor_backup_codes") || [],
          save: async () => {
            // Legacy credentials row has no known backup-code column; refuse backup-code logins rather than allow reuse.
            throw new Error("backup codes unsupported for legacy credentials");
          },
        };
      }
    }

    if (!isAuthorized) {
      const candidates = userRows.filter((u: any) => u.username?.toLowerCase().trim() === cleanUser || u.id?.toLowerCase() === cleanUser || u.id?.toLowerCase() === `user_${cleanUser}`);
      // Two accounts that differ only by case/id form are ambiguous identities: refuse rather than guess.
      const distinct = new Set(candidates.map((u: any) => u.id));
      if (distinct.size > 1) {
        console.error("login refused: ambiguous username matches multiple accounts");
        recordFailure(limiterKey);
        return res.json({ success: false, error: "Incorrect name or secret password." });
      }
      const dbUser = candidates[0];
      if (dbUser?.password && (await verifyPassword(password, dbUser.password))) {
        isAuthorized = true;
        authenticatedUsername = dbUser.username;
        authenticatedAccountId = String(dbUser.id || "");
        authenticatedPid = userPid(dbUser);
        authenticatedGlobalChat = (dbUser.enable_global_chat ?? dbUser.enableGlobalChat) !== false;
        authenticatedCoupleId = dbUser.couple_id || dbUser.coupleId || "couple_default";
        authenticatedRole = dbUser.role === "admin" ? "admin" : dbUser.role === "guest" ? "guest" : "partner";
        if (needsRehash(dbUser.password)) upgradeUserId = dbUser.id;
        const enabled = dbUser.two_factor_enabled ?? dbUser.twoFactorEnabled;
        const secret = dbUser.two_factor_secret ?? dbUser.twoFactorSecret;
        if (enabled && secret) {
          twoFactor = {
            enabled: true,
            secret,
            backupCodes: dbUser.two_factor_backup_codes ?? dbUser.twoFactorBackupCodes ?? [],
            save: async (codes) => {
              const { error } = await supabaseAdmin!.from("user_accounts").update({ two_factor_backup_codes: codes }).eq("id", dbUser.id);
            if (error) throw new Error(error.message);
            },
          };
        }
      }
    }

    if (!isAuthorized) {
      recordFailure(limiterKey);
      return res.json({ success: false, error: "Incorrect name or secret password." });
    }

    // Second factor is enforced here, never in the browser.
    if (twoFactor) {
      if (totp === undefined && backupCode === undefined) {
        return res.json({ success: false, requires2fa: true, error: "Two-factor code required" });
      }
      let secondFactorOk = false;
      if (typeof totp === "string" && totp) {
        secondFactorOk = verifyTotp(totp, twoFactor.secret);
      } else if (typeof backupCode === "string" && backupCode) {
        const used = consumeBackupCode(backupCode, twoFactor.backupCodes);
        if (used.valid) {
          try {
            await twoFactor.save(used.remaining);
            secondFactorOk = true;
          } catch (e: any) {
            console.error("backup code could not be consumed; refusing login:", e?.message);
          }
        }
      }
      if (!secondFactorOk) {
        recordFailure(limiterKey);
        return res.json({ success: false, requires2fa: true, error: "Invalid two-factor code" });
      }
    }
    clearFailures(limiterKey);

    // OPT-IN live write (ENABLE_PASSWORD_REHASH=true): upgrade a legacy hash to per-user-salt scrypt.
    // Off by default; enable only after the deployment checklist in docs/SECURITY_CHANGES.md.
    if (upgradeUserId && process.env.ENABLE_PASSWORD_REHASH === "true") {
      try {
        await supabaseAdmin.from("user_accounts").update({ password: hashPasswordScrypt(password) }).eq("id", upgradeUserId);
      } catch (e: any) {
        console.warn("password hash upgrade skipped:", e?.message);
      }
    }

    const serverSession = createServerSession({ username: authenticatedUsername, coupleId: authenticatedCoupleId, role: authenticatedRole, pid: authenticatedPid });

    let supabaseSession: any = null;
    try {
      // One Supabase auth user PER ACCOUNT (keyed by the permanent id), never per username: two accounts that share a username must not
      // share a login whose app_metadata (pid, role, couple) the other overwrites. Accounts without a pid keep the old username key but carry pid "".
      const authEmail = authenticatedPid ? `pid-${crypto.createHash("sha256").update(authenticatedPid).digest("hex").slice(0, 40)}@ourhome.local` : `${cleanUser}@ourhome.local`;
      const temporaryPassword = createTemporaryAuthPassword();
      const metadata = { app_metadata: { couple_id: authenticatedCoupleId, role: authenticatedRole, username: authenticatedUsername, pid: authenticatedPid, global_chat: authenticatedGlobalChat ? "true" : "false" } };
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existingUser = existingUsers?.users?.find((user: any) => user.email === authEmail);
      const written = existingUser
        ? await supabaseAdmin.auth.admin.updateUserById(existingUser.id, { password: temporaryPassword, ...metadata, email_confirm: true })
        : await supabaseAdmin.auth.admin.createUser({ email: authEmail, password: temporaryPassword, email_confirm: true, ...metadata });
      if (written?.error) throw new Error("auth user write failed");
      // A throwaway client: signing in on the shared service client would store the user session there and switch every later query to that user.
      const authResult = await createClient(supabaseUrl, supabaseKey, NO_SESSION).auth.signInWithPassword({ email: authEmail, password: temporaryPassword });
      supabaseSession = authResult.data.session;
      // Fail closed: never hand out a session whose JWT does not name the account that just logged in (stale/raced metadata).
      if (supabaseSession && !sessionMatchesIdentity(supabaseSession.access_token, { pid: authenticatedPid, coupleId: authenticatedCoupleId, role: authenticatedRole })) {
        console.warn("Supabase session dropped: identity mismatch");
        supabaseSession = null;
      }
    } catch (e: any) {
      console.warn("Supabase auth session unavailable:", e?.message);
    }

    return res.json({ success: true, username: authenticatedUsername, sessionToken: serverSession, supabaseSession, role: authenticatedRole, coupleId: authenticatedCoupleId, pid: authenticatedPid, firebaseToken: mintFirebaseToken({ username: authenticatedUsername, coupleId: authenticatedCoupleId, role: authenticatedRole, accountId: authenticatedAccountId, pid: authenticatedPid, globalChat: authenticatedGlobalChat }) });
  } catch (err: any) {
    console.error("Server login verification error:", err?.message);
    return res.status(500).json({ success: false, error: "Authentication error" });
  }
}

const MIN_PASSWORD_LENGTH = 8;

/** Password change for the signed-in user: verifies the current password server-side. */
export async function changePassword(req: any, res: any) {
  const session = requireRole(req, res, ["admin", "partner", "user"]);
  if (!session) return;
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const { oldPassword, newPassword } = req.body || {};
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 256) {
      return res.status(400).json({ success: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const limiterKey = `chpw|${session.username.toLowerCase()}`;
    if (isBlocked(limiterKey, 5)) return res.status(429).json({ success: false, error: "Too many attempts. Try again later." });

    if (session.role === "admin") {
      // Admin credentials live in admin_settings (adminAccounts / credentials).
      const { data: rows, error } = await supabaseAdmin.from("admin_settings").select("*").in("id", ["adminAccounts", "credentials"]);
      if (error) return res.status(500).json({ success: false, error: "Server error" });
      const accountsRow = (rows || []).find((r: any) => r.id === "adminAccounts");
      const accounts: any[] = readAdminAccounts(accountsRow);
      const idx = accounts.findIndex((a) => a.username?.toLowerCase().trim() === session.username.toLowerCase().trim());
      const legacy = (rows || []).find((r: any) => r.id === "credentials" && r.username?.toLowerCase().trim() === session.username.toLowerCase().trim());
      const stored = idx >= 0 ? accounts[idx].password : legacy?.password;
      if (!stored) {
        // Admin may also be a user_accounts row.
        return changeUserAccountPassword(session, oldPassword, newPassword, limiterKey, res);
      }
      if (!(await verifyPassword(oldPassword || "", stored))) {
        recordFailure(limiterKey);
        return res.status(403).json({ success: false, error: "The old password you entered is incorrect." });
      }
      const next = hashPasswordScrypt(newPassword);
      if (idx >= 0) {
        const updated = accounts.map((a, i) => (i === idx ? { ...a, password: next } : a));
        const { error: e2 } = await supabaseAdmin.from("admin_settings").update(adminAccountsPatch(accountsRow, updated)).eq("id", "adminAccounts");
        if (e2) return res.status(500).json({ success: false, error: "Could not save password" });
      } else {
        const { error: e2 } = await supabaseAdmin.from("admin_settings").update({ password: next }).eq("id", "credentials");
        if (e2) return res.status(500).json({ success: false, error: "Could not save password" });
      }
      clearFailures(limiterKey);
      return res.json({ success: true });
    }
    return changeUserAccountPassword(session, oldPassword, newPassword, limiterKey, res);
  } catch (err: any) {
    console.error("change-password failed:", err?.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

async function changeUserAccountPassword(session: any, oldPassword: unknown, newPassword: string, limiterKey: string, res: any) {
  const { data, error } = await supabaseAdmin!.from("user_accounts").select("id,password,username").ilike("username", escapeLike(session.username.toLowerCase()));
  const row = (data || []).find((u: any) => u.username?.toLowerCase() === session.username.toLowerCase());
  if (error || !row) return res.status(404).json({ success: false, error: "Account not found" });
  if (row.password && !(await verifyPassword(typeof oldPassword === "string" ? oldPassword : "", row.password))) {
    recordFailure(limiterKey);
    return res.status(403).json({ success: false, error: "The old password you entered is incorrect." });
  }
  const { error: e2 } = await supabaseAdmin!.from("user_accounts").update({ password: hashPasswordScrypt(newPassword) }).eq("id", row.id);
  if (e2) return res.status(500).json({ success: false, error: "Could not save password" });
  clearFailures(limiterKey);
  return res.json({ success: true });
}

/** Payments are not implemented. Fail closed: never report a paid or complete state. */
export function stripeCheckoutDisabled(_req: any, res: any) {
  return res.status(501).json({ success: false, status: "unavailable", error: "Online payments are not enabled on this deployment" });
}

/**
 * 2FA enable / disable. Always re-authenticates the signed-in actor: current password, plus a current
 * TOTP (or backup code) when the actor's own account already has 2FA. A bare session is not enough.
 * Actor may act on self; an admin may only RESET (disable) another account, never enrol one.
 */
export async function twoFactor(req: any, res: any) {
  const session = requireRole(req, res, ["admin", "partner", "user"]);
  if (!session) return;
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
    const { action, password, code, secret, backupCodes, targetUsername, targetType } = req.body || {};
    if (action !== "enable" && action !== "disable") return res.status(400).json({ success: false, error: "Invalid action" });
    const limiterKey = `2fa|${session.username.toLowerCase()}`;
    if (isBlocked(limiterKey, 5)) return res.status(429).json({ success: false, error: "Too many attempts. Try again later." });
    if (typeof password !== "string" || !password) return res.status(400).json({ success: false, error: "Current password is required" });

    const find = async (username: string, preferAdmin: boolean) => {
      const { data: rows } = await supabaseAdmin!.from("admin_settings").select("*").in("id", ["adminAccounts", "credentials"]);
      const accountsRow = (rows || []).find((r: any) => r.id === "adminAccounts");
      const accounts = readAdminAccounts(accountsRow);
      const u = username.toLowerCase().trim();
      const adminIdx = accounts.findIndex((a) => a.username?.toLowerCase().trim() === u);
      if (preferAdmin && adminIdx >= 0) {
        const a = accounts[adminIdx];
        return {
          password: a.password, enabled: !!a.twoFactorEnabled && !!a.twoFactorSecret, secret: a.twoFactorSecret, backup: a.twoFactorBackupCodes || [],
          write: async (p: { enabled: boolean; secret: string; backup: string[] }) => {
            const next = accounts.map((x, i) => (i === adminIdx ? { ...x, twoFactorEnabled: p.enabled, twoFactorSecret: p.secret, twoFactorBackupCodes: p.backup, twoFactorCreatedAt: p.enabled ? new Date().toISOString() : "" } : x));
            const { error } = await supabaseAdmin!.from("admin_settings").update(adminAccountsPatch(accountsRow, next)).eq("id", "adminAccounts");
            return error;
          },
        };
      }
      const { data: users } = await supabaseAdmin!.from("user_accounts").select("*").ilike("username", escapeLike(u));
      const row = (users || []).find((x: any) => x.username?.toLowerCase().trim() === u);
      if (!row) return null;
      return {
        password: row.password, enabled: !!row.two_factor_enabled && !!row.two_factor_secret, secret: row.two_factor_secret, backup: row.two_factor_backup_codes || [],
        write: async (p: { enabled: boolean; secret: string; backup: string[] }) => {
          const { error } = await supabaseAdmin!.from("user_accounts").update({ two_factor_enabled: p.enabled, two_factor_secret: p.secret, two_factor_backup_codes: p.backup, two_factor_created_at: p.enabled ? new Date().toISOString() : "" }).eq("id", row.id);
          return error;
        },
      };
    };

    const actor = await find(session.username, session.role === "admin");
    if (!actor || !actor.password || !(await verifyPassword(password, actor.password))) {
      recordFailure(limiterKey);
      return res.status(403).json({ success: false, error: "Password is incorrect." });
    }
    if (actor.enabled) {
      let ok = typeof code === "string" && verifyTotp(code, actor.secret);
      if (!ok && typeof code === "string") {
        const used = consumeBackupCode(code, actor.backup);
        if (used.valid) { ok = true; await actor.write({ enabled: true, secret: actor.secret, backup: used.remaining }); }
      }
      if (!ok) {
        recordFailure(limiterKey);
        return res.status(403).json({ success: false, error: "A valid authenticator code is required." });
      }
    }

    const targetName = typeof targetUsername === "string" && targetUsername ? targetUsername : session.username;
    const self = targetName.toLowerCase().trim() === session.username.toLowerCase().trim();
    if (!self && (session.role !== "admin" || action !== "disable")) {
      return res.status(403).json({ success: false, error: "Only an administrator can reset another account's 2FA" });
    }
    const target = self ? actor : await find(targetName, targetType === "admin");
    if (!target) return res.status(404).json({ success: false, error: "Account not found" });

    if (action === "disable") {
      const err = await target.write({ enabled: false, secret: "", backup: [] });
      if (err) return res.status(500).json({ success: false, error: "Could not save" });
    } else {
      if (typeof secret !== "string" || !/^[A-Z2-7]{16,64}$/.test(secret.toUpperCase())) return res.status(400).json({ success: false, error: "Invalid secret" });
      if (!verifyTotp(typeof req.body.enrollCode === "string" ? req.body.enrollCode : "", secret)) {
        return res.status(400).json({ success: false, error: "The code from your authenticator app did not match." });
      }
      const codes = Array.isArray(backupCodes) ? backupCodes.filter((c: any) => typeof c === "string" && /^[A-Za-z0-9-]{6,32}$/.test(c)).slice(0, 12) : [];
      if (codes.length === 0) return res.status(400).json({ success: false, error: "Backup codes are required" });
      const err = await target.write({ enabled: true, secret: secret.toUpperCase(), backup: codes });
      if (err) return res.status(500).json({ success: false, error: "Could not save" });
    }
    clearFailures(limiterKey);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("two-factor failed:", err?.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

/** POST /api/chat/resolve-participant { usernames: string[] } -> { participants: { [username]: { pid } | { error } } }
 *  Resolves a username to a permanent participant id at send time. Ambiguous or id-less names never resolve. */
export async function resolveParticipant(req: any, res: any) {
  const session = requireRole(req, res, ["admin", "partner", "user"]);
  if (!session) return;
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
  const raw = req.body?.usernames;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10 || raw.some((u: unknown) => typeof u !== "string" || !u.trim() || u.length > 128)) {
    return res.status(400).json({ success: false, error: "Invalid usernames" });
  }
  const names = Array.from(new Set(raw.map((u: string) => u.trim()))) as string[];
  const [adminRes, ...userRes] = await Promise.all([
    supabaseAdmin.from("admin_settings").select("*").in("id", ["adminAccounts", "credentials"]),
    ...names.map((n) => supabaseAdmin!.from("user_accounts").select("id,username,pid_nonce").ilike("username", escapeLike(n.toLowerCase()))),
  ]);
  if (adminRes.error || userRes.some((r: any) => r.error)) return res.status(500).json({ success: false, error: "Lookup failed" });
  const adminRows = adminRes.data || [];
  const adminAccounts = readAdminAccounts(adminRows.find((s: any) => s.id === "adminAccounts"));
  const legacy = adminRows.find((s: any) => s.id === "credentials");
  const participants: Record<string, any> = {};
  names.forEach((n, i) => {
    const r = resolveUsernamePid(n, { userRows: (userRes[i] as any).data || [], adminAccounts, legacy });
    participants[n] = r.ok === true ? { pid: r.pid } : { error: r.reason };
  });
  return res.json({ success: true, participants });
}


/** POST /api/auth/refresh-firebase-token: re-mints the Firestore token from the CURRENT account row, so a change of the global-lounge
 *  switch takes effect (read and send) without signing in again. Same identity, same claims, nothing else changes. */
export async function refreshFirebaseToken(req: any, res: any) {
  const session = requireRole(req, res, ["admin", "partner", "user"]);
  if (!session) return;
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: "Database service unavailable" });
  const pid = session.pid || "";
  if (!pid) return res.status(409).json({ success: false, error: "Sign in again" });
  const accountId = pidAccountId(pid);
  let globalChat = true;
  if (pid.startsWith("u:")) {
    const { data, error } = await supabaseAdmin.from("user_accounts").select("*").eq("id", accountId).maybeSingle();
    if (error || !data || userPid(data) !== pid) return res.status(409).json({ success: false, error: "Account not found; sign in again" });
    globalChat = data.enable_global_chat !== false;
  }
  // Best effort: carry the switch into the Supabase JWT too (new access tokens pick it up on their next refresh).
  try {
    const authEmail = `pid-${crypto.createHash("sha256").update(pid).digest("hex").slice(0, 40)}@ourhome.local`;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const au = list?.users?.find((u: any) => u.email === authEmail);
    if (au) await supabaseAdmin.auth.admin.updateUserById(au.id, { app_metadata: { ...(au.app_metadata || {}), global_chat: globalChat ? "true" : "false" } });
  } catch { /* the proxy still enforces the switch live */ }
  const firebaseToken = mintFirebaseToken({ username: session.username, coupleId: session.coupleId, role: session.role, accountId, pid, globalChat });
  return res.json({ success: true, firebaseToken, globalChat });
}
