import crypto from "node:crypto";
import { requireRole } from "./guards.js";
import { isFirestoreRestConfigured, makeTokenProvider } from "./firestoreRest.js";

/** READ-ONLY dry run: compares the Firestore docs of the six structured collections with the Supabase rows, by id + space + content hash (never by counts alone).
 *  Writes nothing anywhere. Activation (and any source switch) must be refused unless every collection is clean (see `ready`). Output carries ids only, never content. */
export const FS_PREFLIGHT_PAIRS = [
  { fs: "milestones", sb: "milestones" }, { fs: "datePlans", sb: "date_plans" }, { fs: "memories", sb: "memories" },
  { fs: "letters", sb: "letters" }, { fs: "coupleQuestions", sb: "couple_questions" }, { fs: "celebrationCards", sb: "celebration_cards" },
] as const;

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const IGNORE = new Set(["couple_id", "created_at", "updated_at", "timestamp", "created_by", "uploaded_by", "user_id"]);
function norm(v: any): any {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [snake(k), norm(v[k])]));
  return v;
}
/** Hash over the keys both sides have (snake-cased), ignoring space and bookkeeping columns, so a column only one store has never causes a false difference. */
export function contentHash(a: any, shared: string[]): string {
  const o: any = {}; for (const k of shared) o[k] = norm(a[k]);
  return crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);
}
const snakeRow = (r: any) => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [snake(k), v]));

export type PairReport = { collection: string; fsCount: number; sbCount: number; onlyFirestore: string[]; onlySupabase: number; spaceMismatch: string[]; contentDiffers: string[]; fieldMissingInSupabase: { id: string; fields: string[] }[]; emptyComparison: string[]; clean: boolean; truncated: boolean };
export function comparePair(collection: string, fsDocs: any[], sbRows: any[], cap = 200): PairReport {
  const sb = new Map<string, any>(sbRows.map((r) => [String(r.id), snakeRow(r)]));
  const rep: PairReport = { collection, fsCount: fsDocs.length, sbCount: sbRows.length, onlyFirestore: [], onlySupabase: 0, spaceMismatch: [], contentDiffers: [], fieldMissingInSupabase: [], emptyComparison: [], clean: true, truncated: false };
  const seen = new Set<string>();
  for (const d0 of fsDocs) {
    const d = snakeRow(d0); const id = String(d.id ?? "");
    if (!id) { rep.onlyFirestore.push("(no id)"); continue; }
    seen.add(id);
    const row = sb.get(id);
    if (!row) { rep.onlyFirestore.push(id); continue; }
    const fsSpace = String(d.couple_id ?? ""), sbSpace = String(row.couple_id ?? "");
    if (fsSpace !== sbSpace) { rep.spaceMismatch.push(id); continue; }
    const nonEmpty = (v: any) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0) && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
    const fsKeys = Object.keys(d).filter((k) => !IGNORE.has(k) && k !== "id" && nonEmpty(d[k]));
    const missing = fsKeys.filter((k) => !nonEmpty(row[k]));
    if (missing.length) rep.fieldMissingInSupabase.push({ id, fields: missing.sort() });
    const shared = fsKeys.filter((k) => nonEmpty(row[k])).sort();
    if (!shared.length && fsKeys.length) { rep.emptyComparison.push(id); continue; } // nothing could be compared: never counted as clean
    if (contentHash(d, shared) !== contentHash(row, shared)) rep.contentDiffers.push(id);
  }
  rep.onlySupabase = [...sb.keys()].filter((k) => !seen.has(k)).length;
  for (const k of ["onlyFirestore", "spaceMismatch", "contentDiffers", "fieldMissingInSupabase", "emptyComparison"] as const) if (rep[k].length > cap) { (rep as any)[k] = (rep[k] as any[]).slice(0, cap); rep.truncated = true; }
  rep.clean = !rep.fieldMissingInSupabase.length && !rep.emptyComparison.length && !rep.onlyFirestore.length && !rep.spaceMismatch.length && !rep.contentDiffers.length && !rep.truncated;
  return rep;
}

/** Plain Firestore REST value decoding (documents:list). */
function dec(v: any): any {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue; if ("integerValue" in v) return Number(v.integerValue); if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue; if ("nullValue" in v) return null; if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
}
export async function listFsCollection(opts: { fetch: any; token: () => Promise<string>; project: string; collection: string; max?: number }): Promise<any[]> {
  const out: any[] = []; let page = "";
  for (let i = 0; i < 200; i++) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(opts.project)}/databases/(default)/documents/${encodeURIComponent(opts.collection)}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const res = await opts.fetch(url, { method: "GET", headers: { Authorization: `Bearer ${await opts.token()}` } });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Firestore list failed (${res.status})`);
    for (const d of j.documents || []) out.push(Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])));
    page = j.nextPageToken || ""; if (!page) return out;
    if (out.length >= (opts.max ?? 50000)) break;
  }
  throw new Error(`Firestore collection ${opts.collection} is larger than the preflight limit; refusing a partial comparison`);
}

export async function runFsPreflight(db: any, listFs: (collection: string) => Promise<any[]>) {
  const reports: PairReport[] = [];
  for (const p of FS_PREFLIGHT_PAIRS) {
    const sb: any[] = []; let from = 0;
    for (;;) { // page through the whole table, never a sample
      const r = await db.from(p.sb).select("*").order("id", { ascending: true }).range(from, from + 999);
      if (r.error) throw new Error(`Supabase read failed for ${p.sb}`);
      sb.push(...(r.data || [])); if ((r.data || []).length < 1000) break; from += 1000;
    }
    reports.push(comparePair(p.fs, await listFs(p.fs), sb));
  }
  return { ready: reports.every((r) => r.clean), reports };
}

export const reportHash = (reports: PairReport[]) => crypto.createHash("sha256").update(JSON.stringify(reports)).digest("hex");

/** record=false: read-only inspection. record=true (op fs-preflight-record): the same comparison, and ONLY when it returns ready:true the server records it through mem_record_reconciliation() (project + report hash; the SQL side adds the Supabase data fingerprint and re-verifies activation). */
export function makeFsPreflightHandler(getDb: () => any, env: Record<string, string | undefined> = process.env, fetchImpl: any = (globalThis as any).fetch, record = false) {
  return async function preflight(req: any, res: any) {
    const session = requireRole(req, res, ["admin"]);
    if (!session) return;
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: "Database service unavailable" });
    if (!isFirestoreRestConfigured(env)) return res.status(503).json({ success: false, error: "Firestore service account is not configured. Preflight not run; activation stays refused." });
    try {
      const token = makeTokenProvider(env, fetchImpl); const project = String(env.FIREBASE_PROJECT_ID || "").trim();
      if (!project) return res.status(503).json({ success: false, error: "FIREBASE_PROJECT_ID is not set; preflight needs an explicit project and was not run. Activation stays refused." });
      const out = await runFsPreflight(db, (collection) => listFsCollection({ fetch: fetchImpl, token, project, collection }));
      if (!record) return res.json({ success: true, dryRun: true, readOnly: true, project, ...out });
      if (!out.ready) { await db.rpc("mem_clear_reconciliation", {}).catch(() => {}); return res.status(409).json({ success: false, recorded: false, cleared: true, error: "Not recorded: the comparison is not clean. Any earlier record was cleared.", project, ...out }); }
      const rec = await db.rpc("mem_record_reconciliation", { p_project: project, p_report_hash: reportHash(out.reports) });
      if (rec.error) { await db.rpc("mem_clear_reconciliation", {}).catch(() => {}); }
      if (rec.error) return res.status(409).json({ success: false, recorded: false, error: "Not recorded: " + String(rec.error.message || "").replace(/[^\x20-\x7e]/g, " ").slice(0, 200), project, ...out });
      return res.json({ success: true, recorded: true, project, recordedAt: rec.data, ...out });
    } catch (e: any) {
      if (record) { try { await db.rpc("mem_clear_reconciliation", {}); } catch { /* best effort; the flip still needs a fresh record under 60 min */ } }
      return res.status(502).json({ success: false, error: "Preflight could not complete; activation stays refused. " + String(e?.message || "").replace(/[^\x20-\x7e]/g, " ").slice(0, 120) });
    }
  };
}
