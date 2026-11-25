import { keysOf } from "./backupKeys";
import { authHeaders } from "./authHeaders";
import type { TableData } from "./backupFormats";
import { sha256Hex } from "./backupCrypto";

export type BackupSources = { supabase: boolean; firestore: boolean };
export type TableReport = { name: string; source: "supabase" | "firestore"; rows: number; status: "ok" | "count mismatch" | "skipped" | "failed"; detail?: string; removedColumns: string[]; oversizeRows: number; excludedPrivate: number; sha256?: string };
export type Progress = (msg: string) => void;
type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export const NOT_INCLUDED_COMMON = [
  "private 1:1 chat messages and chat of other couples (never exported through the admin panel); legacy 1:1 rows without participant ids are left out too, so chat is NOT backed up by this panel",
  "database schema, policies, triggers and functions",
  "Supabase auth users and Storage files",
  "Firestore security rules and indexes; Firestore collections that are not on the known app list; nested Firestore collections (found and reported, not exported)",
  "any Supabase table outside the fixed list of 17",
  "numbers: an unsafe number (above 2^53, 16+ digits, or outside double range) in a known bigint/numeric column is kept exactly as text; in any other column (unknown, json, nested) the table is marked failed rather than guessed",
];
export const NOT_INCLUDED_READABLE = ["password hashes, 2FA secrets, tokens, API keys, pid nonces and pair keys (removed on the server)"];

async function post(f: Fetch, op: string, body: any) {
  const r = await f(`/api/proxy?op=${op}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(String(j?.error || `Request failed (${r.status})`).slice(0, 160));
  return j;
}
export const planExpect = (plan: any) => ({ supabaseRef: plan?.supabase?.ref ?? null, firestoreProject: plan?.firestore?.project ?? null });
export async function fetchPlan(target: "app" | "separate" = "app", f: Fetch = (globalThis as any).fetch) { return post(f, "backup-plan", { target }); }

/** Identity of the sources this server is connected to. If the user typed an expected value it must match exactly, otherwise the export is refused. */
export function checkIdentity(plan: any, sources: BackupSources, expected: { supabaseRef?: string; firestoreProject?: string }): { ok: boolean; message: string; checked: boolean } {
  const es = (expected.supabaseRef || "").trim(), ef = (expected.firestoreProject || "").trim();
  if (sources.supabase && es && es !== (plan?.supabase?.ref || "")) return { ok: false, checked: true, message: `Connected Supabase project is ${plan?.supabase?.ref || "unknown"}, not ${es}. Nothing was exported.` };
  if (sources.firestore && ef && ef !== (plan?.firestore?.project || "")) return { ok: false, checked: true, message: `Connected Firestore project is ${plan?.firestore?.project || "unknown"}, not ${ef}. Nothing was exported.` };
  return { ok: true, checked: !!((sources.supabase && es) || (sources.firestore && ef)), message: "" };
}

const MAX_DEPTH_PATH = 5;
/** Reads every page of every selected table and collection, following Firestore subcollections. A failure in one is recorded and the rest continue; nothing is dropped silently. */
export async function runExport(sources: BackupSources, plan: any, f: Fetch = (globalThis as any).fetch, progress: Progress = () => {}, opts: { full?: boolean; target?: "app" | "separate" } = {}): Promise<{ tables: TableData[]; reports: TableReport[]; extraNotes: string[] }> {
  const full = !!opts.full; const target = opts.target || "app"; const expect = planExpect(plan);
  const tables: TableData[] = []; const reports: TableReport[] = []; const extraNotes: string[] = [];
  const jobs: { source: "supabase" | "firestore"; name: string }[] = [];
  if (sources.supabase) for (const t of plan?.supabase?.tables || []) jobs.push({ source: "supabase", name: t });
  if (sources.firestore && plan?.firestore?.available) for (const c of plan.firestore.collections || []) jobs.push({ source: "firestore", name: c });
  const seen = new Set(jobs.filter((j) => j.source === "firestore").map((j) => j.name));
  for (let ji = 0; ji < jobs.length; ji++) {
    const job = jobs[ji];
    const rows: any[] = []; const removed = new Set<string>(); let oversize = 0; let excluded = 0; let total: number | undefined; let unsafe = 0; let status: TableReport["status"] = "ok"; let detail: string | undefined;
    let cursor: any = job.source === "supabase" ? 0 : "";
    try {
      for (let i = 0; i < 2000; i++) {
        progress(`${job.source}: ${job.name} (${rows.length} rows)`);
        const j = await post(f, "backup-page", job.source === "supabase" ? { source: "supabase", table: job.name, offset: cursor, full, target, expect } : { source: "firestore", collection: job.name, pageToken: cursor, full, target, expect });
        if (j.missing) { status = "skipped"; detail = String(j.reason || "table not found"); break; }
        if (j.excludedPath) { status = "skipped"; detail = String(j.reason || "private path"); break; }
        rows.push(...(j.rows || [])); oversize += Number(j.oversize || 0); excluded += Number(j.excludedPrivate || 0); (j.removedKeys || []).forEach((k: string) => removed.add(k));
        if (typeof j.total === "number") total = j.total;
        unsafe += Number(j.unsafeNumbers || 0);
        if (Number(j.subcollectionLookupFailures || 0) > 0) { status = "failed"; detail = "some subcollections could not be listed"; }
        for (const sp of j.subcollections || []) if (!seen.has(sp) && sp.split("/").length <= MAX_DEPTH_PATH) { seen.add(sp); jobs.push({ source: "firestore", name: sp }); }
        if (j.next === null || j.next === undefined) break;
        if (job.source === "supabase" && j.next <= cursor) throw new Error("paging did not advance");
        cursor = j.next;
        if (i === 1999) throw new Error("too many pages; stopped");
      }
      if (job.source === "supabase" && rows.length && !rows.some((r: any) => r._omitted) && !rows.every((r: any) => keysOf(job.name).every((k) => k in r && r[k] !== null))) { status = "failed"; detail = `key column ${keysOf(job.name).join("+")} not present on every row: this table could not be restored from the file`; }
      if (unsafe > 0) { status = "failed"; detail = `${unsafe} whole number(s) above 2^53 would not be exact in this export`; }
      if (status === "ok" && total !== undefined && total !== rows.length + excluded) { status = "count mismatch"; detail = `server counted ${total}, received ${rows.length} plus ${excluded} private rows left out`; }
    } catch (e: any) { status = "failed"; detail = String(e?.message || "failed").slice(0, 160); }
    const name = `${job.source}_${job.name}`;
    let sha: string | undefined;
    if (status !== "skipped") { tables.push({ name, rows }); sha = await sha256Hex(JSON.stringify(rows)); }
    reports.push({ name, source: job.source, rows: rows.length, status, detail, removedColumns: [...removed].sort(), oversizeRows: oversize, excludedPrivate: excluded, sha256: sha });
  }
  for (const c of plan?.firestore?.notExported || []) if (sources.firestore) reports.push({ name: `firestore_${c}`, source: "firestore", rows: 0, status: "skipped", detail: "not on the known app collection list: not exported, needs a decision", removedColumns: [], oversizeRows: 0, excludedPrivate: 0 });
  const sub = reports.filter((r) => r.source === "firestore" && r.name.split("/").length > 1).length;
  if (sub) extraNotes.push(`${sub} Firestore subcollection(s) were followed.`);
  return { tables, reports, extraNotes };
}

export function buildManifest(sources: BackupSources, reports: TableReport[], plan: any, opts: { full?: boolean; identityChecked?: boolean; now?: Date; target?: "app" | "separate" } = {}) {
  const complete = reports.length > 0 && reports.every((r) => r.status === "ok" || r.status === "skipped") && reports.every((r) => r.oversizeRows === 0);
  const full = !!opts.full;
  return {
    kind: full ? "ENCRYPTED DATA COPY - rows of the listed public tables with credentials kept, one non-snapshot read; recovery NOT verified" : "READABLE DATA EXPORT - secrets removed, NOT restorable",
    mode: full ? "full" : "readable",
    createdAt: (opts.now || new Date()).toISOString(),
    target: opts.target || "app",
    sources: Object.entries(sources).filter(([, v]) => v).map(([k]) => k),
    identity: { supabaseRef: sources.supabase ? plan?.supabase?.ref ?? null : undefined, supabaseHost: sources.supabase ? plan?.supabase?.host ?? null : undefined, firestoreProject: sources.firestore ? plan?.firestore?.project ?? null : undefined, checkedAgainstExpectedValueTypedByAdmin: !!opts.identityChecked },
    consistency: "Tables are read one after another, not in a single snapshot. Rows changed during the export can differ between tables.",
    allTablesReadWithoutProblems: complete,
    tables: reports,
    notIncluded: [...NOT_INCLUDED_COMMON, ...(full ? [] : NOT_INCLUDED_READABLE)],
    firestoreNote: sources.firestore ? plan?.firestore?.note || undefined : undefined,
  };
}

/** Checks a decrypted full backup against its own manifest: every table's hash and row count are recomputed. */
export async function verifyBackup(file: { manifest: any; tables: Record<string, { rows: any[] }> }): Promise<{ ok: boolean; problems: string[]; checked: number }> {
  const problems: string[] = []; let checked = 0;
  for (const r of file.manifest?.tables || []) {
    if (r.status === "skipped") continue;
    const t = file.tables?.[r.name];
    if (!t) { problems.push(`${r.name}: missing from file`); continue; }
    checked++;
    if (t.rows.length !== r.rows) problems.push(`${r.name}: row count ${t.rows.length} differs from manifest ${r.rows}`);
    if (r.sha256 && (await sha256Hex(JSON.stringify(t.rows))) !== r.sha256) problems.push(`${r.name}: content hash differs`);
  }
  if (file.manifest?.allTablesReadWithoutProblems !== true) problems.push("the manifest says some tables had problems when the backup was taken");
  return { ok: problems.length === 0 && checked > 0, problems, checked };
}

/** Sends the Firestore documents of a verified file to the server in small batches. The server refuses anything outside the known top-level collections and never touches the membership collection.
 *  Returns totals only. A failed batch stops the run and reports which batch, so a retry in "missing" mode is safe (existing documents are never touched). */
export async function restoreFirestoreDocs(file: { manifest?: any; tables: Record<string, { rows: any[] }> }, opts: { target: "app" | "separate"; confirmProject: string; mode: "missing" | "fields"; expect: { supabaseRef: string | null; firestoreProject: string | null } }, f: Fetch = (globalThis as any).fetch, progress: Progress = () => {}) {
  const fileProject = (file as any)?.manifest?.identity?.firestoreProject;
  if (!fileProject || fileProject !== opts.confirmProject) throw new Error(`This file was taken from Firestore project "${fileProject || "unknown"}", not "${opts.confirmProject}". Nothing was written.`);
  const docs: any[] = [];
  for (const [name, t] of Object.entries(file.tables || {})) if (name.startsWith("firestore_")) for (const r of t.rows || []) if (r && typeof r._path === "string" && r.fields && !r._missing) docs.push({ _path: r._path, fields: r.fields });
  const total = { written: 0, alreadyExisted: 0, failed: 0, documents: docs.length, failedPaths: [] as string[] };
  let batch: any[] = []; let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    progress(`Firestore restore: ${total.written + total.alreadyExisted + total.failed}/${docs.length}`);
    const j = await post(f, "backup-restore-fs", { target: opts.target, confirmProject: opts.confirmProject, mode: opts.mode, docs: batch, expect: opts.expect });
    total.written += j.written; total.alreadyExisted += j.alreadyExisted; total.failed += j.failed; total.failedPaths.push(...(j.failedPaths || []));
    batch = []; bytes = 0;
  };
  for (const d of docs) {
    const sz = JSON.stringify(d).length;
    if (batch.length >= 50 || (batch.length && bytes + sz > 2_500_000)) await flush();
    batch.push(d); bytes += sz;
  }
  await flush();
  return total;
}
