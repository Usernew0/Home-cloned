import { requireRole } from "./guards.js";
import { visibleChatRow, isDirectChatRow } from "./policy.js";
import { keysOf, BACKUP_TABLES } from "../src/lib/backupKeys.js";
import { readCatalog, readTablePage, withReadOnly, isIdent, type Catalog, type Q } from "./backupCatalog.js";
import { isFirestoreRestConfigured, makeTokenProvider } from "./firestoreRest.js";

/**
 * Admin-only data copy. Reads rows of a fixed list of public Supabase tables and the known top-level Firestore collections, page by page, so the browser can assemble one file.
 * Two modes: "readable" removes secret-looking keys; "full" keeps every column (credentials included) and the browser encrypts the file with the admin's passphrase before it is saved.
 * Reads only, except restoreFs, which the admin triggers explicitly per batch. Not a snapshot, not a schema backup; private chat is never exported; whole numbers above 2^53 are flagged.
 */
export { BACKUP_TABLES };
const SENSITIVE_KEY = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|backup_?codes|credential|pid_nonce|pair_key)/i;
const MAX_ROWS = 300;
const MAX_BYTES = 3_500_000; // stays below the serverless response limit (4.5 MB)

/** Removes secret-looking keys at every depth. Returns the cleaned value; `removed` collects the key names (never values). */
export function stripSecrets(v: any, removed: Set<string>, depth = 0): any {
  if (Array.isArray(v)) return depth > 12 ? v : v.map((x) => stripSecrets(x, removed, depth + 1));
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (SENSITIVE_KEY.test(k)) { removed.add(k); continue; }
      out[k] = depth > 12 ? x : stripSecrets(x, removed, depth + 1);
    }
    return out;
  }
  return v;
}

export function exportRow(table: string, row: any, removed: Set<string>, redactAdmin: (r: any) => any = (r) => r, full = false): any {
  if (full) return row; // FULL mode keeps every column (hashes, 2FA, nonces): the browser encrypts the whole file before it is saved
  const base = table === "admin_settings" ? redactAdmin(row) : row;
  return stripSecrets(base, removed);
}

/** Fits rows into the response budget. A single row larger than the budget is replaced by a marker, never silently dropped. */
export function fitRows(rows: any[], maxBytes = MAX_BYTES): { rows: any[]; used: number; oversize: number } {
  const out: any[] = []; let size = 2; let oversize = 0; let used = 0;
  for (const r of rows) {
    let s = JSON.stringify(r).length + 1;
    let item = r;
    if (s > maxBytes) { item = { id: r?.id ?? null, _omitted: "row too large for one download page", approx_bytes: s }; s = JSON.stringify(item).length + 1; oversize++; }
    if (out.length && size + s > maxBytes) break;
    out.push(item); size += s; used++;
  }
  return { rows: out, used, oversize };
}

/** Plain Firestore REST value decoding. */
export function decodeValue(v: any): any {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue; if ("integerValue" in v) return Number(v.integerValue); if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue; if ("nullValue" in v) return null; if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue; if ("bytesValue" in v) return `[bytes ${String(v.bytesValue).length}b64]`;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodeValue(x)]));
  return null;
}
export function decodeDoc(d: any): any {
  const id = String(d?.name || "").split("/").pop() || "";
  return { _id: decodeURIComponent(id), ...Object.fromEntries(Object.entries(d?.fields || {}).map(([k, x]) => [k, decodeValue(x)])) };
}

const snakeKeys = (r: any) => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()), v]));
/** Private 1:1 messages of OTHER people are never exported through the admin panel (same rule as the admin proxy). Sparse rows fail closed. */
export function keepChatRow(row: any, pid: string, coupleId = ""): boolean {
  const r = snakeKeys(row);
  if (!visibleChatRow(r, pid, true)) return false;
  if (isDirectChatRow(r)) return true; // visibleChatRow already limited 1:1 rows to this admin's own pid
  if (!coupleId) return false; // unknown couple: fail closed, no group/lounge rows
  return String(r.couple_id ?? "") === String(coupleId); // group/lounge rows of OTHER couples (or with no couple) are not exported
}
/** Firestore collections the app itself uses (from the app code and rules). Everything else is NOT exported and is reported, so an unknown or chat-like collection can never slip in.
 *  chatGroups and groupInvites hold other couples' group-chat membership, and presence is ephemeral: not exported. Nested collections are not used by the app: found and reported, not exported. */
export const FS_EXPORT_COLLECTIONS = ["milestones", "datePlans", "memories", "letters", "coupleQuestions", "celebrationCards", "activityLogs", "coupleTenants", "musicTracks", "musicGrants", "adminSettings", "userAccounts", "chatMessages", "members"] as const;
export const isExportablePath = (path: string) => !path.includes("/") && (FS_EXPORT_COLLECTIONS as readonly string[]).includes(path);
const COLLECTION_PATH = /^[A-Za-z0-9_.-]{1,100}(\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})*$/;
/** Chat-like paths other than the two known top-level chat collections are treated as private and skipped (and reported). */
export function isPrivateChatPath(path: string): boolean {
  const segs = path.split("/");
  if (segs.length === 1) return /chat|message|dm|direct|conversation|inbox/i.test(path) && !["chatMessages", "chatGroups"].includes(path); // chatMessages is filtered row by row; chatGroups holds group metadata
  return segs.filter((_, i) => i % 2 === 0).some((c) => /chat|message|dm|direct|conversation|inbox/i.test(c));
}
const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** Integers above 2^53 cannot be trusted after JSON parsing (the server's database client reads numbers as JavaScript numbers). Counted so the export can be marked incomplete instead of silently rounded. */
export function countUnsafeNumbers(v: any): number {
  if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as any)["$unsafeNumber"] === "string") return 1;
  // Whole numbers above 2^53, and decimals that already show 16+ significant digits (a parsed JSON number cannot prove a high-precision numeric survived), are both reported.
  if (typeof v === "number") return (Number.isInteger(v) && Math.abs(v) > Number.MAX_SAFE_INTEGER) || (!Number.isInteger(v) && String(Math.abs(v)).replace(/e.*$/i, "").replace(/\D/g, "").replace(/^0+/, "").length >= 16) ? 1 : 0;
  if (Array.isArray(v)) return v.reduce((a: number, x: any) => a + countUnsafeNumbers(x), 0 as number);
  if (v && typeof v === "object") return (Object.values(v) as any[]).reduce((a: number, x: any) => a + countUnsafeNumbers(x), 0 as number);
  return 0;
}
/** Exact numbers. PostgREST sends bigint/numeric as bare JSON numbers and JSON.parse would round them. For the BACKUP clients only, the response text is rewritten before parsing.
 *  A token is "unsafe" when it is a whole number above 2^53, has 16+ significant digits, is not finite as a double (1e400), or underflows to zero while its digits are not zero (1e-400); 0e10 and -0 are fine.
 *  An unsafe token at row level becomes a string holding the exact token ONLY when that table.column is on the numeric-column allowlist (columns known to be bigint/numeric on the real schema), because a string restored into a bigint/numeric column is exact.
 *  Any other unsafe token (unknown column, a json scalar, anything nested in json/array columns) becomes the marker object {"$unsafeNumber":"<token>"}: the table then fails, and the type is never guessed. */
export const NUMERIC_COLUMNS: Record<string, string[]> = { item_shares: ["id"], membership_ops: ["fence"], user_accounts: ["membership_epoch"] };
export function isUnsafeToken(tok: string): boolean {
  const isInt = /^-?\d+$/.test(tok);
  if (isInt) return BigInt(tok) > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(tok) < -BigInt(Number.MAX_SAFE_INTEGER);
  const mant = tok.replace(/[eE].*$/, "").replace(/\D/g, "").replace(/^0+/, "");
  const v = Number(tok);
  return mant.length >= 16 || !Number.isFinite(v) || (v === 0 && mant.length > 0 && /[1-9]/.test(mant));
}
export function quoteUnsafeNumbers(text: string, table = "", cols: Record<string, string[]> = NUMERIC_COLUMNS): { text: string; converted: number } {
  let out = ""; let depth = 0; let converted = 0; let i = 0; const n = text.length; const rowDepth = text.trimStart()[0] === "[" ? 2 : 1; let key = "";
  const allowed = new Set(cols[table] || []);
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1; while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const raw = text.slice(i, j + 1); out += raw; i = j + 1;
      if (depth === rowDepth) { let k = i; while (k < n && /\s/.test(text[k])) k++; if (text[k] === ":") { try { key = JSON.parse(raw); } catch { key = ""; } } }
      continue;
    }
    if (ch === "{" || ch === "[") { depth++; out += ch; i++; continue; }
    if (ch === "}" || ch === "]") { depth--; out += ch; i++; continue; }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1; while (j < n && /[0-9.eE+-]/.test(text[j])) j++;
      const tok = text.slice(i, j);
      if (isUnsafeToken(tok)) {
        if (depth === rowDepth && allowed.has(key)) out += `"${tok}"`; else out += `{"$unsafeNumber":"${tok}"}`;
        converted++;
      } else out += tok;
      i = j; continue;
    }
    out += ch; i++;
  }
  return { text: out, converted };
}
/** fetch wrapper for backup Supabase clients: only JSON responses from /rest/v1/<table> are rewritten. */
export const exactNumbersFetch = (base: any) => async (input: any, init?: any) => {
  const res: Response = await base(input, init);
  try {
    const url = String(typeof input === "string" ? input : input?.url || "");
    if (!url.includes("/rest/v1/") || !/json/i.test(res.headers.get("content-type") || "")) return res;
    const table = (url.split("/rest/v1/")[1] || "").split(/[?#]/)[0];
    const body = quoteUnsafeNumbers(await res.text(), table);
    return new Response(body.text, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch { return res; }
};
const ascii = (s: any, n = 140) => String(s ?? "").replace(/[^\x20-\x7e]/g, " ").slice(0, n);

/** A SEPARATE backup source (BACKUP_SOURCE_*): lets the app read another project (for example the old one) for backup without changing the app's own database, login or runtime. */
export const separateConfigured = (env: Record<string, string | undefined>) => !!(env.BACKUP_SOURCE_SUPABASE_URL || env.BACKUP_SOURCE_FIREBASE_PROJECT_ID);

const STORAGE_ID = /^[A-Za-z0-9_.-]{1,100}$/; const STORAGE_CHUNK = 2 * 1024 * 1024;
const storagePathOk = (p: string) => p.length > 0 && p.length < 1000 && !p.startsWith("/") && !/[\u0000-\u001f\u007f]/.test(p) && p.split("/").every((s) => s.length > 0 && s !== "." && s !== "..");
export function makeBackupHandlers(getDb: () => any, env: Record<string, string | undefined> = process.env, fetchImpl: any = (globalThis as any).fetch, redactAdmin: (r: any) => any = (r) => r, getSeparateDb: () => any = () => null, getRestAccess: (target: "app" | "separate") => { url: string; key: string } | null = () => null, getPg: (target: "app" | "separate") => (() => Promise<{ query: Q; close: () => Promise<void> }>) | null = () => null) {
  const fsBase = (project: string) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;
  const tokens: Record<string, () => Promise<string>> = {};
  type Ctx = { target: "app" | "separate"; db: any; sbUrl: string; fsEnv: Record<string, string | undefined>; project: string; fsOk: boolean; token: () => Promise<string> };
  /** Resolves which connection a request reads from. "separate" is refused when not configured: it never falls back to the app's own connection. */
  const ctxFor = (target: any): Ctx | null => {
    if (target === "separate") {
      if (!separateConfigured(env)) return null;
      const fsEnv = { FIREBASE_SERVICE_ACCOUNT_EMAIL: env.BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: env.BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY, FIREBASE_PROJECT_ID: env.BACKUP_SOURCE_FIREBASE_PROJECT_ID };
      tokens.separate ||= makeTokenProvider(fsEnv, fetchImpl);
      return { target: "separate", db: getSeparateDb(), sbUrl: String(env.BACKUP_SOURCE_SUPABASE_URL || ""), fsEnv, project: String(env.BACKUP_SOURCE_FIREBASE_PROJECT_ID || "").trim(), fsOk: isFirestoreRestConfigured(fsEnv), token: tokens.separate };
    }
    tokens.app ||= makeTokenProvider(env, fetchImpl);
    return { target: "app", db: getDb(), sbUrl: String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ""), fsEnv: env, project: String(env.FIREBASE_PROJECT_ID || "").trim(), fsOk: isFirestoreRestConfigured(env), token: tokens.app };
  };
  const refOf = (url: string) => { try { const h = new URL(url).hostname; return { host: h, ref: h.split(".")[0] }; } catch { return { host: "", ref: "" }; } };
  /** Every page/restore call carries the identity the plan showed. If the server's connection for that target no longer matches, nothing is read or written. */
  const identityMismatch = (c: Ctx, body: any): boolean => {
    const e = body?.expect; if (!e || typeof e !== "object") return true; // missing binding is refused too
    const ref = refOf(c.sbUrl).ref || null;
    return String(e.supabaseRef ?? "") !== String(ref ?? "") || String(e.firestoreProject ?? "") !== String(c.project || "");
  };
  const noStore = (res: any) => { try { res.setHeader?.("Cache-Control", "no-store"); } catch { /* ignore */ } };

  /** Live inventory of the public tables: the project's own REST description (service key). Never trusts the fixed list alone. A failure is reported, never hidden. */
  const discCache: Record<string, { at: number; v: any }> = {};
  const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
  async function discoverTables(target: "app" | "separate"): Promise<{ ok: boolean; names: string[]; pks: Record<string, string[]>; reason?: string }> {
    const hit = discCache[target]; if (hit && Date.now() - hit.at < 60000) return hit.v;
    const a = getRestAccess(target);
    let v: any;
    if (!a || !a.url || !a.key) v = { ok: false, names: [], pks: {}, reason: "no service access for table discovery" };
    else {
      try {
        const r = await fetchImpl(`${a.url.replace(/\/+$/, "")}/rest/v1/`, { method: "GET", headers: { apikey: a.key, Authorization: `Bearer ${a.key}`, Accept: "application/openapi+json" } });
        const j: any = await r.json().catch(() => null);
        const defs = j?.definitions || j?.components?.schemas;
        if (!r.ok || !defs || typeof defs !== "object") v = { ok: false, names: [], pks: {}, reason: `the project did not return its table list (${r.status})` };
        else {
          const names = Object.keys(defs).filter((n) => TABLE_NAME.test(n)).sort(); const pks: Record<string, string[]> = {};
          for (const n of names) { const props = defs[n]?.properties || {}; const pk = Object.keys(props).filter((k) => /<pk\/>/.test(String(props[k]?.description || ""))); if (pk.length) pks[n] = pk; }
          v = { ok: true, names, pks };
        }
      } catch (e: any) { v = { ok: false, names: [], pks: {}, reason: `table discovery failed: ${ascii(e?.message, 80)}` }; }
    }
    discCache[target] = { at: Date.now(), v }; return v;
  }

  /** Direct database inventory (needs SUPABASE_DB_URL). One short read-only snapshot per call; cached 30s so paging does not re-read the catalog. */
  const catCache: Record<string, { at: number; v: Catalog }> = {};
  async function pgRun<T>(target: "app" | "separate", fn: (q: Q) => Promise<T>): Promise<T> {
    const open = getPg(target); if (!open) throw new Error("no database connection configured");
    const cl = await open();
    try { return await withReadOnly({ query: cl.query }, fn); } finally { await cl.close().catch(() => {}); }
  }
  async function catalogFor(target: "app" | "separate", fresh = false): Promise<Catalog> {
    const hit = catCache[target]; if (!fresh && hit && Date.now() - hit.at < 30000) return hit.v;
    const v = await pgRun(target, (q) => readCatalog(q)); catCache[target] = { at: Date.now(), v }; return v;
  }

  async function plan(req: any, res: any) {
    if (!requireRole(req, res, ["admin"])) return;
    noStore(res);
    const c = ctxFor(req.body?.target === "separate" ? "separate" : "app");
    if (!c) return res.status(400).json({ success: false, error: "No separate backup source is configured on the server" });
    const { host, ref } = refOf(c.sbUrl);
    const out: any = { success: true, target: c.target, targets: [{ id: "app", label: "This app's own connection" }, ...(separateConfigured(env) ? [{ id: "separate", label: "Separately configured backup source" }] : [])], supabase: { available: !!c.db, tables: [...BACKUP_TABLES] as string[], ref: ref || null, host: host || null, discovery: null as any, keys: {} as Record<string, string[]> }, firestore: { available: false, project: c.project || null, collections: [] as string[], note: "" } };
    if (c.db) {
      const d = await discoverTables(c.target);
      const known = BACKUP_TABLES as readonly string[];
      const unknown = d.ok ? d.names.filter((n) => !known.includes(n)) : [];
      out.supabase.tables = [...known, ...unknown]; out.supabase.keys = Object.fromEntries(unknown.filter((n) => d.pks[n]).map((n) => [n, d.pks[n]]));
      out.supabase.discovery = d.ok ? { ok: true, found: d.names.length, extraTables: unknown, listedButNotInProject: known.filter((n) => !d.names.includes(n)), withoutPrimaryKey: unknown.filter((n) => !d.pks[n]) } : { ok: false, reason: d.reason, note: "Only the fixed list of 17 tables is read. Any other table in this project is NOT covered." };
    }
    if (getPg(c.target)) {
      try { const cat = await catalogFor(c.target, true); out.catalog = { ok: true, data: cat, dbRef: getPg(c.target) && (getPg(c.target) as any).ref ? (getPg(c.target) as any).ref : undefined }; }
      catch (e: any) { out.catalog = { ok: false, reason: `database connection failed: ${ascii(String(e?.code ? `${e.code} ` : "") + String(/certificate|self.signed|altnames|unable to verify/i.test(String(e?.message)) ? "TLS verification failed (not a password problem): " + String(e?.message) : "") + String(/^(BAD_URL|WRONG_PROJECT)$/.test(String(e?.code)) || /certificate|self.signed|hostname|altnames|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|password authentication|timeout/i.test(String(e?.message)) ? e?.message : "connection error").replace(/postgres(ql)?:\/\/\S+/gi, "[url]"), 120)}` }; }
    } else out.catalog = { ok: false, reason: c.target === "separate" ? "BACKUP_SOURCE_SUPABASE_DB_URL is not set on the server" : "SUPABASE_DB_URL is not set on the server" };
    const project = () => c.project; const fsConfigured = () => c.fsOk; const token = c.token;
    if (!fsConfigured()) out.firestore.note = c.target === "separate" ? "Firestore is off: BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL and BACKUP_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY are not both set on the server." : "Firestore is off: FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY are not both set on the server.";
    else if (!project()) out.firestore.note = c.target === "separate" ? "Firestore is off: BACKUP_SOURCE_FIREBASE_PROJECT_ID is not set on the server. The service account is set." : "Firestore is off: FIREBASE_PROJECT_ID is not set on the server. The service account is set.";
    else {
      try {
        const found: string[] = []; let pageToken: string | undefined; let refused = 0; let pages = 0;
        do {
          const r = await fetchImpl(`${fsBase(project())}:listCollectionIds`, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(pageToken ? { pageSize: 300, pageToken } : { pageSize: 300 }) });
          const j: any = await r.json().catch(() => ({}));
          if (!r.ok) { refused = r.status; break; }
          found.push(...(j.collectionIds || []).map(String)); pageToken = j.nextPageToken || undefined;
        } while (pageToken && ++pages < 50);
        if (refused) out.firestore.note = `Firestore refused the collection list (${refused}).`;
        else if (pageToken) { out.firestore.listIncomplete = true; out.firestore.note = "The collection list has more than 50 pages: not all collections are known, so Firestore is not exported (nothing is silently dropped)."; }
        else { out.firestore.available = true; out.firestore.allCollections = found; out.firestore.collections = found.filter(isExportablePath); out.firestore.notExported = found.filter((x: string) => !isExportablePath(x)); }
      } catch (e: any) { out.firestore.note = `Firestore could not be reached: ${ascii(e?.message, 80)}`; }
    }
    return res.json(out);
  }

  async function page(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    noStore(res);
    const c = ctxFor(req.body?.target === "separate" ? "separate" : "app");
    if (!c) return res.status(400).json({ success: false, error: "No separate backup source is configured on the server" });
    if (identityMismatch(c, req.body)) return res.status(409).json({ success: false, error: "The connected source does not match the one shown in the plan. Nothing was read." });
    const project = () => c.project; const fsConfigured = () => c.fsOk; const token = c.token;
    const source = String(req.body?.source || "");
    const full = req.body?.full === true;
    const pid = String(session.pid || ""); const cid = String((session as any).coupleId || "");
    try {
      if (source === "storage") {
        if (!full) return res.status(400).json({ success: false, error: "Storage files are part of the Encrypted data copy only" });
        const a = getRestAccess(c.target); if (!a || !a.url || !a.key) return res.status(503).json({ success: false, error: "Storage access is not configured for this source" });
        const base = `${a.url.replace(/\/+$/, "")}/storage/v1`; const hdr = { apikey: a.key, Authorization: `Bearer ${a.key}` };
        const action = String(req.body?.action || "");
        if (action === "buckets") {
          const r = await fetchImpl(`${base}/bucket`, { headers: hdr }); const j: any = await r.json().catch(() => null);
          if (!r.ok || !Array.isArray(j)) return res.status(502).json({ success: false, error: `Storage bucket list failed (${r.status})` });
          return res.json({ success: true, buckets: j.map((b: any) => ({ id: String(b.id), name: String(b.name), public: !!b.public })).filter((b: any) => STORAGE_ID.test(b.id)), dropped: j.filter((b: any) => !STORAGE_ID.test(String(b?.id))).length });
        }
        const bucket = String(req.body?.bucket || ""); if (!STORAGE_ID.test(bucket)) return res.status(400).json({ success: false, error: "Invalid bucket" });
        if (action === "list") {
          const prefix = String(req.body?.prefix || ""); if (prefix && !storagePathOk(prefix)) return res.status(400).json({ success: false, error: "Invalid path" });
          const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
          const r = await fetchImpl(`${base}/object/list/${encodeURIComponent(bucket)}`, { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }) });
          const j: any = await r.json().catch(() => null);
          if (!r.ok || !Array.isArray(j)) return res.status(502).json({ success: false, error: `Storage list failed (${r.status})` });
          const items = j.map((o: any) => ({ name: String(o.name), folder: o.id === null || o.id === undefined, size: Number(o?.metadata?.size ?? 0), mime: String(o?.metadata?.mimetype ?? "") }));
          const bad = items.filter((o: any) => !o.name || o.name.includes("/") || o.name === "." || o.name === "..").length;
          return res.json({ success: true, items: items.filter((o: any) => o.name && !o.name.includes("/") && o.name !== "." && o.name !== ".."), invalidNames: bad, next: j.length === 100 ? offset + 100 : null });
        }
        if (action === "get") {
          const path = String(req.body?.path || ""); if (!storagePathOk(path)) return res.status(400).json({ success: false, error: "Invalid path" });
          const chunk = Math.max(0, Math.floor(Number(req.body?.chunk) || 0)); const start = chunk * STORAGE_CHUNK;
          const r = await fetchImpl(`${base}/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { ...hdr, Range: `bytes=${start}-${start + STORAGE_CHUNK - 1}` } });
          if (!(r.status === 200 || r.status === 206)) return res.status(502).json({ success: false, error: `Storage file read failed (${r.status})` });
          const buf = Buffer.from(await r.arrayBuffer());
          let total = buf.length; const cr = /\/(\d+)$/.exec(String(r.headers?.get?.("content-range") || "")); let data = buf;
          if (r.status === 206 && cr) total = Number(cr[1]); else if (r.status === 200) { total = buf.length; data = buf.subarray(start, start + STORAGE_CHUNK); }
          return res.json({ success: true, b64: data.toString("base64"), total, chunks: Math.max(1, Math.ceil(total / STORAGE_CHUNK)), chunk });
        }
        return res.status(400).json({ success: false, error: "Unknown storage action" });
      }
      if (source === "pg") {
        if (!full) return res.status(400).json({ success: false, error: "The database-level copy is part of the Encrypted data copy only" });
        const table = String(req.body?.table || ""); const [sc, nm, ...rest] = table.split(".");
        if (rest.length || !isIdent(sc) || !isIdent(nm)) return res.status(400).json({ success: false, error: "Unknown table" });
        const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
        let cat: Catalog; try { cat = await catalogFor(c.target); } catch { return res.status(502).json({ success: false, error: "Database connection failed" }); }
        if (!cat.tables.some((t) => t.schema === sc && t.name === nm)) return res.status(400).json({ success: false, error: "Unknown table" });
        let pg; try { pg = await pgRun(c.target, (q) => readTablePage(q, cat, sc, nm, offset, MAX_ROWS)); } catch { return res.status(502).json({ success: false, error: "Table could not be read" }); }
        const unsafe = pg.unsafeNumbers; const fit = fitRows(pg.rows);
        const more = fit.used < pg.rows.length || pg.rows.length === MAX_ROWS;
        return res.json({ success: true, rows: fit.rows, next: more ? offset + fit.used : null, total: pg.total, oversize: fit.oversize, excludedPrivate: 0, unsafeNumbers: unsafe, removedKeys: [], keyless: pg.keyless });
      }
      if (source === "supabase") {
        const db = c.db;
        if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
        const table = String(req.body?.table || "");
        const knownTable = (BACKUP_TABLES as readonly string[]).includes(table);
        const disc = knownTable ? null : await discoverTables(c.target);
        if (!knownTable && !(disc && disc.ok && TABLE_NAME.test(table) && disc.names.includes(table))) return res.status(400).json({ success: false, error: "Unknown table" });
        const orderKeys = knownTable ? keysOf(table) : (disc!.pks[table] || ["id"]);
        const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
        const run = (orderKeys: string[]) => orderKeys.reduce((q: any, k: string) => q.order(k, { ascending: true }), db.from(table).select("*", offset === 0 ? { count: "exact" } : undefined)).range(offset, offset + MAX_ROWS - 1);
        const notFound = (e: any) => String(e?.code) === "42P01" || String(e?.code) === "PGRST205" || /does not exist|schema cache|could not find the table/i.test(String(e?.message || ""));
        let r = await run(orderKeys);
        if (r.error) { // no id column: order by the table's first column so paging stays stable
          const probe = await db.from(table).select("*").limit(1);
          if (probe.error) {
            if (notFound(probe.error)) return res.json({ success: true, missing: true, reason: "table not found", rows: [], next: null });
            return res.status(502).json({ success: false, error: "Table could not be read" }); // unreadable is a FAILURE, never a skip
          }
          const first = Object.keys((probe.data || [])[0] || {})[0];
          if (!first) return res.json({ success: true, rows: [], next: null, total: 0, removedKeys: [] });
          r = await run([first]);
          if (r.error) return res.status(502).json({ success: false, error: "Table could not be read" });
        }
        const removed = new Set<string>();
        let data: any[] = r.data || [];
        let excluded = 0;
        const keepRow = (x: any) => full ? true : table === "chat_messages" ? (c.target === "app" && keepChatRow(x, pid, cid)) : table === "deleted_rows_backup" ? x?.src_table !== "chat_messages" : true; // deleted chat rows keep the same privacy rule: left out whole
        if (!full && (table === "chat_messages" || table === "deleted_rows_backup")) { const kept = data.filter(keepRow); excluded = data.length - kept.length; data = kept; }
        const unsafe = countUnsafeNumbers(data);
        const cleaned = data.map((x: any) => exportRow(table, x, removed, redactAdmin, full));
        const fit = fitRows(cleaned);
        const fetched = (r.data || []).length;
        // rows consumed from the source = kept rows used + excluded rows before them. Excluded rows are counted on the page that read them; if the page was cut we re-read from the cut point.
        let consumedSource = fetched;
        if (fit.used < cleaned.length) {
          let keptSeen = 0; consumedSource = 0;
          for (const row of r.data || []) { const k = keepRow(row); if (k) { if (keptSeen === fit.used) break; keptSeen++; } consumedSource++; }
          excluded = consumedSource - fit.used;
        }
        const more = consumedSource < fetched || fetched === MAX_ROWS;
        return res.json({ success: true, rows: fit.rows, next: more ? offset + consumedSource : null, total: typeof r.count === "number" ? r.count : undefined, oversize: fit.oversize, excludedPrivate: excluded, unsafeNumbers: unsafe, removedKeys: [...removed].sort() });
      }
      if (source === "firestore") {
        if (!fsConfigured() || !project()) return res.status(503).json({ success: false, error: "Firestore is not configured on the server" });
        const col = String(req.body?.collection || "");
        if (!COLLECTION_PATH.test(col)) return res.status(400).json({ success: false, error: "Invalid collection" });
        const segs = col.split("/"); const id = segs[segs.length - 1];
        if (!full && !isExportablePath(col)) return res.json({ success: true, rows: [], next: null, excludedPath: true, reason: segs.length > 1 ? "nested collection: found, not exported (the app does not use nested collections)" : "not on the known app collection list: not exported, needs a decision", subcollections: [] });
        const tok = String(req.body?.pageToken || "");
        const url = `${fsBase(project())}/${encPath(col)}?pageSize=${MAX_ROWS}&showMissing=true${tok ? `&pageToken=${encodeURIComponent(tok)}` : ""}`;
        const r = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${await token()}` } });
        const j: any = await r.json().catch(() => ({}));
        if (!r.ok) return res.status(502).json({ success: false, error: `Firestore read failed (${r.status})` });
        const removed = new Set<string>();
        let rawDocs: any[] = j.documents || [];
        let excluded = 0;
        if (!full && id === "chatMessages") { const kept = rawDocs.filter((d) => c.target === "app" && keepChatRow(decodeDoc(d), pid, cid)); excluded = rawDocs.length - kept.length; rawDocs = kept; }
        const docs = rawDocs.map((d: any) => {
          const path = String(d.name || "").split("/documents/")[1] || "";
          return full ? { _path: path, _id: decodeDoc(d)._id, ...(d.createTime ? {} : { _missing: true }), createTime: d.createTime ?? null, updateTime: d.updateTime ?? null, fields: d.fields || {} } : stripSecrets({ _path: path, ...(d.createTime ? {} : { _missing: true }), ...decodeDoc(d) }, removed);
        });
        const fit = fitRows(docs);
        // Opaque page tokens cannot be re-cut: refuse rather than drop documents.
        if (fit.used < docs.length) return res.status(413).json({ success: false, error: "A Firestore page was too large for one response; nothing was dropped, the export for this collection stopped." });
        // Subcollections of these documents (bounded fan-out), so nothing nested is silently missed.
        const subs = new Set<string>(); let subFail = 0;
        {
          const paths = rawDocs.map((d: any) => String(d.name || "").split("/documents/")[1]).filter(Boolean);
          for (let k = 0; k < paths.length; k += 8) {
            await Promise.all(paths.slice(k, k + 8).map(async (dp) => {
              try {
                let tk: string | undefined; let pg = 0;
                do {
                  const lr = await fetchImpl(`${fsBase(project())}/${encPath(dp)}:listCollectionIds`, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(tk ? { pageSize: 100, pageToken: tk } : { pageSize: 100 }) });
                  const lj: any = await lr.json().catch(() => ({}));
                  if (!lr.ok) { subFail++; return; }
                  for (const c of lj.collectionIds || []) { if (dp.split("/").length >= 18) subFail++; else subs.add(`${dp}/${c}`); }
                  tk = lj.nextPageToken || undefined;
                } while (tk && ++pg < 50);
                if (tk) subFail++;
              } catch { subFail++; }
            }));
          }
        }
        return res.json({ success: true, rows: fit.rows, next: j.nextPageToken || null, oversize: fit.oversize, excludedPrivate: excluded, subcollections: [...subs], subcollectionLookupFailures: subFail, removedKeys: [...removed].sort() });
      }
      return res.status(400).json({ success: false, error: "Unknown source" });
    } catch (e: any) {
      return res.status(502).json({ success: false, error: `Export read failed: ${ascii(e?.message, 100)}` });
    }
  }

  /** RESTORE of Firestore documents from a verified backup file. Admin only. Never runs by itself: the browser calls it per batch after the admin typed the target project id.
   *  mode "missing": a document is created only if it does not exist (precondition exists=false); an existing document is never touched.
   *  mode "fields": the backup's top-level fields are written onto the document; fields the backup does not mention stay as they are. Server times (createTime/updateTime) cannot be restored.
   *  Refused: the membership collection (owned by the membership saga), private chat paths, chat documents that are not clearly non-1:1, malformed paths or values. Content is never echoed back. */
  const VALUE_KEY = /^(string|integer|double|boolean|null|timestamp|reference|bytes|geoPoint|array|map)Value$/;
  const BLOCKED_TOP = new Set(["_capability_probe"]); // "members" is restored create-only ("missing" mode), like every other collection; the membership tables come back with the SQL script
  const validFields = (f: any): boolean => !!f && typeof f === "object" && !Array.isArray(f) && Object.values(f).every((v: any) => v && typeof v === "object" && Object.keys(v).length === 1 && VALUE_KEY.test(Object.keys(v)[0]));
  const FIELDS_BLOCKED = new Set(["userAccounts", "adminSettings", "coupleTenants", "musicGrants"]); // credentials and ownership: "fields" mode never overwrites these
  async function restoreFs(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    noStore(res);
    if (req.body?.target === "separate") return res.status(403).json({ success: false, error: "A separately configured backup source is read-only. Nothing was written." });
    const cid = String((session as any).coupleId || "");
    const c = ctxFor(req.body?.target === "separate" ? "separate" : "app");
    if (!c) return res.status(400).json({ success: false, error: "No separate backup source is configured on the server" });
    if (!c.fsOk || !c.project) return res.status(503).json({ success: false, error: "Firestore is not configured for this source" });
    if (identityMismatch(c, req.body)) return res.status(409).json({ success: false, error: "The connected source does not match the one shown in the plan. Nothing was written." });
    if (String(req.body?.confirmProject || "") !== c.project) return res.status(409).json({ success: false, error: `The typed project id does not match the connected Firestore project (${c.project}). Nothing was written.` });
    const mode = req.body?.mode === "fields" ? "fields" : "missing";
    const docs: any[] = Array.isArray(req.body?.docs) ? req.body.docs : [];
    if (!docs.length || docs.length > 100) return res.status(400).json({ success: false, error: "Send between 1 and 100 documents per call" });
    const checked: { path: string; fields: any }[] = [];
    for (const d of docs) {
      const path = String(d?._path || "");
      const segs = path.split("/");
      if (!/^[A-Za-z0-9_.-]{1,100}(\/[A-Za-z0-9_.-]{1,100})+$/.test(path) || segs.length % 2 !== 0) return res.status(400).json({ success: false, error: "A document path is malformed. Nothing was written." });
            if (d?._missing) continue; // parent-only placeholders carry no data and are never created
      if (BLOCKED_TOP.has(segs[0])) return res.status(400).json({ success: false, error: `Documents of "${segs[0]}" are never restored by the panel. Nothing was written.` });
      if (!validFields(d?.fields)) return res.status(400).json({ success: false, error: "A document has malformed fields. Nothing was written." });
      if (mode === "fields" && FIELDS_BLOCKED.has(segs[0])) return res.status(400).json({ success: false, error: `"fields" mode does not overwrite ${segs[0]}; use "missing". Nothing was written.` });
            checked.push({ path, fields: d.fields });
    }
    let created = 0, existing = 0, failed = 0; const failedPaths: string[] = [];
    for (const d of checked) {
      try {
        const q = mode === "missing" ? "currentDocument.exists=false" : Object.keys(d.fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : "`" + k.replace(/[\\`]/g, "\\$&") + "`")}`).join("&");
        const r = await fetchImpl(`${fsBase(c.project)}/${encPath(d.path)}${q ? `?${q}` : ""}`, { method: "PATCH", headers: { Authorization: `Bearer ${await c.token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: d.fields }) });
        if (r.ok) created++;
        else {
          const j: any = await r.json().catch(() => ({})); const st = String(j?.error?.status || "");
          if (mode === "missing" && (st === "ALREADY_EXISTS" || st === "FAILED_PRECONDITION")) existing++; // only these mean "the document is already there"
          else { failed++; failedPaths.push(d.path); } // ABORTED, quota, permission, malformed reference...: not restored, listed
        }
      } catch { failed++; failedPaths.push(d.path); }
    }
    return res.json({ success: true, mode, project: c.project, written: created, alreadyExisted: existing, failed, failedPaths: failedPaths.slice(0, 20) });
  }
  async function restoreStorage(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]); if (!session) return; noStore(res);
    if (req.body?.target === "separate") return res.status(403).json({ success: false, error: "A separately configured backup source is read-only. Nothing was written." });
    const c = ctxFor("app"); if (!c) return res.status(400).json({ success: false, error: "No source" });
    if (identityMismatch(c, req.body)) return res.status(409).json({ success: false, error: "The connected source does not match the one shown in the plan. Nothing was written." });
    if (String(req.body?.confirmProject || "") !== refOf(c.sbUrl).ref) return res.status(409).json({ success: false, error: "The typed project id does not match the connected Supabase project. Nothing was written." });
    const a = getRestAccess("app"); if (!a || !a.url || !a.key) return res.status(503).json({ success: false, error: "Storage access is not configured" });
    const bucket = String(req.body?.bucket || ""); const path = String(req.body?.path || "");
    if (!STORAGE_ID.test(bucket) || !storagePathOk(path)) return res.status(400).json({ success: false, error: "Invalid bucket or path. Nothing was written." });
    const b64 = String(req.body?.b64 || ""); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length > 3_000_000) return res.status(400).json({ success: false, error: "Invalid file data. Nothing was written." });
    const mime = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(req.body?.mime || "")) ? String(req.body.mime) : "application/octet-stream";
    const base = `${a.url.replace(/\/+$/, "")}/storage/v1`;
    // The file arrives whole (the client sends one call per file up to 3MB; larger files are refused by the client with an explicit report). Existing objects are never overwritten.
    const r = await fetchImpl(`${base}/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { apikey: a.key, Authorization: `Bearer ${a.key}`, "Content-Type": mime, "x-upsert": "false" }, body: Buffer.from(b64, "base64") });
    if (r.ok) return res.json({ success: true, written: true });
    const j: any = await r.json().catch(() => ({})); const dup = r.status === 409 || /already exists|Duplicate/i.test(String(j?.message || j?.error || ""));
    return res.json({ success: true, written: false, alreadyExisted: dup, failed: !dup });
  }
  /** Large files: the browser uploads straight to Storage with a one-object signed upload URL, so the file never passes through the function body limit. Same guards as restoreStorage; existing objects are never replaced. */
  async function signStorage(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]); if (!session) return; noStore(res);
    if (req.body?.target === "separate") return res.status(403).json({ success: false, error: "A separately configured backup source is read-only. Nothing was written." });
    const c = ctxFor("app"); if (!c) return res.status(400).json({ success: false, error: "No source" });
    if (identityMismatch(c, req.body)) return res.status(409).json({ success: false, error: "The connected source does not match the one shown in the plan. Nothing was written." });
    if (String(req.body?.confirmProject || "") !== refOf(c.sbUrl).ref) return res.status(409).json({ success: false, error: "The typed project id does not match the connected Supabase project. Nothing was written." });
    const a = getRestAccess("app"); if (!a || !a.url || !a.key) return res.status(503).json({ success: false, error: "Storage access is not configured" });
    const bucket = String(req.body?.bucket || ""); const path = String(req.body?.path || "");
    if (!STORAGE_ID.test(bucket) || !storagePathOk(path)) return res.status(400).json({ success: false, error: "Invalid bucket or path. Nothing was written." });
    const base = `${a.url.replace(/\/+$/, "")}/storage/v1`;
    const r = await fetchImpl(`${base}/object/upload/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { apikey: a.key, Authorization: `Bearer ${a.key}`, "Content-Type": "application/json", "x-upsert": "false" }, body: "{}" });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && typeof j?.url === "string" && j.url.startsWith("/object/upload/sign/")) return res.json({ success: true, uploadUrl: `${base}${j.url}` });
    const dup = r.status === 409 || /already exists|Duplicate/i.test(String(j?.message || j?.error || ""));
    return res.json({ success: true, alreadyExisted: dup, failed: !dup });
  }
  return { plan, page, restoreFs, restoreStorage, signStorage };
}
