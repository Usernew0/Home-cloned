import { keysOf } from "./backupKeys";
import { authHeaders } from "./authHeaders";
import type { TableData } from "./backupFormats";
import { sha256Hex } from "./backupCrypto";

export type BackupSources = { supabase: boolean; firestore: boolean };
export type TableReport = { name: string; source: "supabase" | "firestore"; rows: number; status: "ok" | "count mismatch" | "skipped" | "failed"; detail?: string; removedColumns: string[]; oversizeRows: number; excludedPrivate: number; sha256?: string };
export type Progress = (msg: string) => void;
type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const NOT_INCLUDED_BASE = [
  "database schema, policies, triggers and functions",
  "Supabase auth users and Storage files (media-uploads and any other bucket)",
  "Firestore security rules and indexes, Vercel environment variables and other project settings",
  "any Supabase table outside the fixed list of 17 (tables created later are not discovered yet)",
  "numbers: an unsafe number (above 2^53, 16+ digits, or outside double range) in a known bigint/numeric column is kept exactly as text; in any other column (unknown, json, nested) the table is marked failed rather than guessed",
];
const NOT_INCLUDED_PRIVATE_CHAT = "private 1:1 chat messages and chat of other couples (left out of a readable export on purpose; the encrypted data copy includes all chat)";
export const NOT_INCLUDED_COMMON = [NOT_INCLUDED_PRIVATE_CHAT, ...NOT_INCLUDED_BASE];
export const NOT_INCLUDED_FULL = NOT_INCLUDED_BASE;
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

const MAX_DEPTH_PATH = 19; // path segments of a collection (nine levels of nesting). Anything deeper is reported as a failure, never dropped.
/** Reads every page of every selected table and collection, following Firestore subcollections. A failure in one is recorded and the rest continue; nothing is dropped silently. */
import { BACKUP_TABLES as KNOWN_TABLES } from "./backupKeys";
/** Key columns of a table: the fixed ones for known tables; for a discovered table its primary key from the project (none = restored by whole-row match). */
export const keyColsFor = (plan: any, name: string): string[] => (KNOWN_TABLES as readonly string[]).includes(name) ? keysOf(name) : (plan?.supabase?.keys?.[name] || []);
export async function runExport(sources: BackupSources, plan: any, f: Fetch = (globalThis as any).fetch, progress: Progress = () => {}, opts: { full?: boolean; target?: "app" | "separate" } = {}): Promise<{ tables: TableData[]; reports: TableReport[]; extraNotes: string[]; coherence?: { checked: boolean; changed: string[]; note?: string } }> {
  const full = !!opts.full; const target = opts.target || "app"; const expect = planExpect(plan);
  const tables: TableData[] = []; const reports: TableReport[] = []; const extraNotes: string[] = [];
  const jobs: { source: "supabase" | "firestore" | "pg"; name: string }[] = [];
  const usePg = !!(full && sources.supabase && plan?.catalog?.ok);
  if (usePg) for (const t of plan.catalog.data.tables || []) jobs.push({ source: "pg", name: `${t.schema}.${t.name}` });
  else if (sources.supabase) for (const t of plan?.supabase?.tables || []) jobs.push({ source: "supabase", name: t });
  if (sources.firestore && plan?.firestore?.available) for (const c of (full ? (plan.firestore.allCollections || plan.firestore.collections) : plan.firestore.collections) || []) jobs.push({ source: "firestore", name: c });
  const seen = new Set(jobs.filter((j) => j.source === "firestore").map((j) => j.name));
  for (let ji = 0; ji < jobs.length; ji++) {
    const job = jobs[ji];
    const rows: any[] = []; const removed = new Set<string>(); let oversize = 0; let excluded = 0; let total: number | undefined; let unsafe = 0; let status: TableReport["status"] = "ok"; let detail: string | undefined;
    let cursor: any = job.source === "firestore" ? "" : 0;
    try {
      for (let i = 0; i < 2000; i++) {
        progress(`${job.source}: ${job.name} (${rows.length} rows)`);
        const j = await post(f, "backup-page", job.source === "supabase" || job.source === "pg" ? { source: job.source, table: job.name, offset: cursor, full, target, expect } : { source: "firestore", collection: job.name, pageToken: cursor, full, target, expect });
        if (j.missing) { status = "skipped"; detail = String(j.reason || "table not found"); break; }
        if (j.excludedPath) { status = "skipped"; detail = String(j.reason || "private path"); break; }
        rows.push(...(j.rows || [])); oversize += Number(j.oversize || 0); excluded += Number(j.excludedPrivate || 0); (j.removedKeys || []).forEach((k: string) => removed.add(k));
        if (typeof j.total === "number") total = j.total;
        unsafe += Number(j.unsafeNumbers || 0);
        if (Number(j.subcollectionLookupFailures || 0) > 0) { status = "failed"; detail = "some subcollections could not be listed"; }
        for (const sp of j.subcollections || []) { if (seen.has(sp)) continue; seen.add(sp); if (sp.split("/").length <= MAX_DEPTH_PATH) jobs.push({ source: "firestore", name: sp }); else reports.push({ name: `firestore_${sp.slice(0, 80)}`, source: "firestore", rows: 0, status: "failed", detail: "nested deeper than the supported depth: not followed, NOT backed up", removedColumns: [], oversizeRows: 0, excludedPrivate: 0 }); }
        if (j.next === null || j.next === undefined) break;
        if (job.source !== "firestore" && j.next <= cursor) throw new Error("paging did not advance");
        cursor = j.next;
        if (i === 1999) throw new Error("too many pages; stopped");
      }
      if (job.source === "supabase" && rows.length && !rows.some((r: any) => r._omitted) && !rows.every((r: any) => keyColsFor(plan, job.name).every((k: string) => k in r && r[k] !== null))) { status = "failed"; detail = `key column ${keyColsFor(plan, job.name).join("+")} not present on every row: this table could not be restored from the file`; }
      if (unsafe > 0) { status = "failed"; detail = `${unsafe} whole number(s) above 2^53 would not be exact in this export`; }
      if (job.source === "pg" && status === "ok" && !rows.length && (total ?? 0) > 0) { status = "failed"; detail = "the table has rows but none were received"; }
      if (status === "ok" && total !== undefined && total !== rows.length + excluded) { status = "count mismatch"; detail = `server counted ${total}, received ${rows.length} plus ${excluded} private rows left out`; }
    } catch (e: any) { status = "failed"; detail = String(e?.message || "failed").slice(0, 160); }
    const name = `${job.source}_${job.name}`;
    let sha: string | undefined;
    if (status !== "skipped" && !(job.source === "pg" && status !== "ok")) { tables.push({ name, rows }); sha = await sha256Hex(JSON.stringify(rows)); }
    reports.push({ name, source: job.source === "firestore" ? "firestore" : "supabase", rows: rows.length, status, detail, removedColumns: [...removed].sort(), oversizeRows: oversize, excludedPrivate: excluded, sha256: sha });
  }
  for (const c of full ? [] : (plan?.firestore?.notExported || [])) if (sources.firestore) reports.push({ name: `firestore_${c}`, source: "firestore", rows: 0, status: "skipped", detail: "not on the known app collection list: not exported, needs a decision", removedColumns: [], oversizeRows: 0, excludedPrivate: 0 });
  const sub = reports.filter((r) => r.source === "firestore" && r.name.split("/").length > 1).length;
  if (sub) extraNotes.push(`${sub} Firestore subcollection(s) were followed.`);
  if (full && sources.supabase) {
    const st = await exportStorageFiles(plan, f, progress, { target, expect });
    if (st.report.status === "ok" || st.rows.length) tables.push({ name: "storage_files", rows: st.rows });
    reports.push(st.report);
  }
  // Coherence: the pages were read at different moments. Re-read the server's write counters and structure and compare with the start; any change fails the gate.
  let coherence: { checked: boolean; changed: string[]; note?: string } | undefined;
  if (usePg) {
    try {
      await new Promise((r) => setTimeout(r, 1500)); // server write statistics are flushed with a short delay
      const after = await post(f, "backup-plan", { target, full });
      if (!after?.catalog?.ok) coherence = { checked: false, changed: [], note: "could not re-read the database at the end" };
      else {
        const a0 = plan.catalog.data.activity || {}; const a1 = after.catalog.data.activity || {};
        const c0 = plan.catalog.data.rowCounts || {}; const c1 = after.catalog.data.rowCounts || {};
        const changed = [...new Set([...Object.keys(a0), ...Object.keys(a1), ...Object.keys(c0), ...Object.keys(c1)])].filter((k) => a0[k] !== a1[k] || c0[k] !== c1[k]);
        const shape = (c: any) => JSON.stringify([c.tables, c.constraints, c.indexes, c.triggers, c.functions, c.views, c.policies, c.types, c.extensions]);
        if (shape(plan.catalog.data) !== shape(after.catalog.data)) changed.push("(database structure)");
        coherence = { checked: true, changed };
      }
    } catch (e: any) { coherence = { checked: false, changed: [], note: String(e?.message || "re-read failed").slice(0, 100) }; }
  }
  return { tables, reports, extraNotes, coherence };
}

export function buildManifest(sources: BackupSources, reports: TableReport[], plan: any, opts: { full?: boolean; identityChecked?: boolean; now?: Date; target?: "app" | "separate"; coherence?: { checked: boolean; changed: string[]; note?: string } } = {}) {
  const coh = opts.coherence; const usedPg = !!(opts.full && sources.supabase && plan?.catalog?.ok);
  const cohGap = usedPg ? (!coh || !coh.checked ? [`NOT CONSISTENT: could not confirm that nothing changed during the export (${coh?.note || "not checked"})`] : coh.changed.length ? [`NOT CONSISTENT: writes happened during the export (${coh.changed.slice(0, 8).join(", ")}${coh.changed.length > 8 ? ", ..." : ""}). Run it again when nobody is using the app`] : ["Consistency: no writes were detected during the export by the server's table statistics (not a proof; the pages are separate reads)"]) : [];
  const complete0 = reports.length > 0 && reports.every((r) => r.status === "ok" || r.status === "skipped") && reports.every((r) => r.oversizeRows === 0);
  const full = !!opts.full;
  const complete = complete0 && !(usedPg && (!coh || !coh.checked || coh.changed.length > 0));
  return {
    kind: full ? "ENCRYPTED DATA COPY - all rows of the listed public tables and all Firestore documents found (nested included), credentials and private chat kept as stored, one non-snapshot read; recovery NOT verified on a real project; NOT a complete project backup (see notIncluded)" : "READABLE DATA EXPORT - secrets removed, NOT restorable",
    mode: full ? "full" : "readable",
    createdAt: (opts.now || new Date()).toISOString(),
    target: opts.target || "app",
    sources: Object.entries(sources).filter(([, v]) => v).map(([k]) => k),
    identity: { supabaseDbRef: sources.supabase && plan?.catalog?.ok ? plan.catalog.dbRef ?? null : undefined, supabaseRef: sources.supabase ? plan?.supabase?.ref ?? null : undefined, supabaseHost: sources.supabase ? plan?.supabase?.host ?? null : undefined, firestoreProject: sources.firestore ? plan?.firestore?.project ?? null : undefined, checkedAgainstExpectedValueTypedByAdmin: !!opts.identityChecked },
    consistency: "Tables are read one after another, not in a single snapshot. Rows changed during the export can differ between tables.",
    allTablesReadWithoutProblems: complete,
    headline: "NOT A COMPLETE BACKUP: see completenessGaps for everything this file does not carry or could not prove",
    coherence: coh ?? null,
    catalog: sources.supabase && full && plan?.catalog?.ok ? plan.catalog.data : undefined,
    inventory: sources.supabase ? { supabaseTables: plan?.supabase?.discovery ?? null, keys: plan?.supabase?.keys ?? {} } : undefined,
    completenessGaps: [
      ...cohGap,
      ...(sources.supabase && full && plan?.catalog?.ok ? [...(plan.catalog.data.notCarried || []), ...(plan.catalog.data.tables || []).filter((t: any) => !t.keys.length).map((t: any) => `${t.schema}.${t.name} has no primary key: paged by physical order and restored as insert-if-absent`), ...(plan.catalog.data.tables || []).filter((t: any) => !reports.some((r) => r.name === `pg_${t.schema}.${t.name}` && r.status === "ok")).map((t: any) => `${t.schema}.${t.name} was not read completely`)] : []),
      ...(sources.supabase && full && !plan?.catalog?.ok ? [`Database-level copy is off (${plan?.catalog?.reason || "no connection"}): schema, policies, functions, auth users and storage metadata are NOT in this file`] : []),
      ...(sources.supabase && !(full && plan?.catalog?.ok) && !plan?.supabase?.discovery?.ok ? ["Supabase table discovery failed: only the fixed list of 17 tables was read; other tables, if any, are NOT in this file"] : []),
      ...(sources.supabase && !(full && plan?.catalog?.ok) && plan?.supabase?.discovery?.ok ? ["The table list comes from the project's REST description, which shows only tables exposed through the REST layer, not the full database catalog"] : []),
      ...reports.filter((r) => r.status === "failed").map((r) => `${r.name}: ${r.detail || "failed"}`),
      ...(sources.supabase && full && reports.some((r) => r.name === "storage_files") ? ["Storage objects are restored as owner and bytes only: created_at, etag/metadata, version and user_metadata are not preserved (Storage regenerates them). owner/owner_id come back through the storage owner script."] : []),
      ...(sources.supabase && full && reports.some((r) => r.name === "storage_files" && r.status === "ok") && !plan?.catalog?.ok ? ["Storage file count could not be checked against storage.objects (no database catalog): completeness of the file list is only checked by two listings, not verified against the database."] : []),
      ...(sources.firestore && plan?.firestore?.listIncomplete ? ["The Firestore collection list could not be read to the end: not all collections are known."] : []),
      ...(full ? ["Firestore rules and indexes, Vercel and Supabase project settings, Auth provider settings and Storage bucket policies outside the database are not part of this file"] : []),
    ],
    tables: reports,
    notIncluded: full ? [...NOT_INCLUDED_FULL] : [...NOT_INCLUDED_COMMON, ...NOT_INCLUDED_READABLE],
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
const STORAGE_TOTAL_CAP = 100 * 1024 * 1024; export const STORAGE_RESTORE_MAX = 2_000_000; // raw bytes per file the panel can write back in one call
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
/** Storage files (bucket contents) through the Storage API: every bucket, every folder, every chunk. Any failure, the size cap, or a count that disagrees with storage.objects fails the report (never silent). */
export async function exportStorageFiles(plan: any, f: Fetch, progress: Progress, opts: { target: "app" | "separate"; expect: any }): Promise<{ rows: any[]; report: TableReport }> {
  const rows: any[] = []; const problems: string[] = []; let raw = 0;
  const base = { source: "storage", full: true, target: opts.target, expect: opts.expect };
  try {
    const bk = await post(f, "backup-page", { ...base, action: "buckets" });
    if (bk.dropped) problems.push(`${bk.dropped} bucket(s) with an unsupported name were not read`);
    for (const b of bk.buckets || []) {
      const queue: string[] = [""]; let guard = 0;
      while (queue.length) {
        const prefix = queue.shift()!; let offset: number | null = 0;
        while (offset !== null) {
          if (++guard > 20000) throw new Error("too many storage listing calls; stopped");
          const j: any = await post(f, "backup-page", { ...base, action: "list", bucket: b.id, prefix, offset });
          if (j.invalidNames) problems.push(`${j.invalidNames} object name(s) under ${b.id}/${prefix} could not be handled`);
          for (const it of j.items || []) {
            const path = prefix ? `${prefix}/${it.name}` : it.name;
            if (it.folder) { queue.push(path); continue; }
            if (raw + (it.size || 0) > STORAGE_TOTAL_CAP) { problems.push(`size cap reached: ${b.id}/${path} and everything after it were NOT copied`); queue.length = 0; offset = null; break; }
            progress(`storage: ${b.id}/${path}`);
            const parts: Uint8Array[] = []; let total = 0;
            for (let ch = 0, chunks = 1; ch < chunks; ch++) { const g: any = await post(f, "backup-page", { ...base, action: "get", bucket: b.id, path, chunk: ch }); parts.push(b64ToBytes(g.b64)); chunks = g.chunks; total = g.total; }
            const size = parts.reduce((n, p) => n + p.length, 0);
            if (size !== total) { problems.push(`${b.id}/${path}: received ${size} of ${total} bytes`); continue; }
            const all = new Uint8Array(size); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
            let bin = ""; for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode(...all.subarray(i, i + 0x8000));
            raw += size; rows.push({ bucket: b.id, name: path, size, mime: it.mime || "", sha256: await sha256Hex(bin), b64: btoa(bin), restorable: true });
          }
          if (offset !== null) offset = j.next ?? null;
        }
      }
    }
    if (!problems.length) {
      // Final listing pass: the set of objects must still be the one that was copied (listing errors throw and fail the report; they never look like an empty bucket).
      let again = 0;
      for (const b of bk.buckets || []) {
        const queue: string[] = [""]; let guard2 = 0;
        while (queue.length) {
          const prefix = queue.shift()!; let offset: number | null = 0;
          while (offset !== null) {
            if (++guard2 > 20000) throw new Error("too many storage listing calls; stopped");
            const j: any = await post(f, "backup-page", { ...base, action: "list", bucket: b.id, prefix, offset });
            for (const it of j.items || []) { if (it.folder) queue.push(prefix ? `${prefix}/${it.name}` : it.name); else again++; }
            offset = j.next ?? null;
          }
        }
      }
      if (again !== rows.length) problems.push(`the final listing shows ${again} objects but ${rows.length} were copied (objects changed during the export)`);
    }
    const expected = plan?.catalog?.ok ? plan.catalog.data.rowCounts?.["storage.objects"] : undefined;
    if (typeof expected === "number" && expected !== rows.length) problems.push(`storage.objects lists ${expected} objects but ${rows.length} files were copied`);
  } catch (e: any) { problems.push(String(e?.message || "storage read failed").slice(0, 120)); }
  const big = rows.filter((r) => !r.restorable).length;
  return { rows, report: { name: "storage_files", source: "supabase", rows: rows.length, status: problems.length ? "failed" : "ok", detail: [...problems.slice(0, 3)].join("; ") || undefined, removedColumns: [], oversizeRows: 0, excludedPrivate: 0 } as any };
}
export async function restoreStorageFiles(file: { manifest?: any; tables: Record<string, { rows: any[] }> }, opts: { confirmProject: string; expect: any }, f: Fetch = (globalThis as any).fetch, progress: Progress = () => {}) {
  const fileRef = (file as any)?.manifest?.identity?.supabaseRef;
  if (!fileRef || fileRef !== opts.confirmProject) throw new Error(`This file was taken from Supabase project "${fileRef || "unknown"}", not "${opts.confirmProject}". Nothing was written.`);
  const rows: any[] = (file.tables?.storage_files?.rows || []); const out = { written: 0, alreadyExisted: 0, conflicting: 0, failed: 0, tooLarge: 0, files: rows.length, failedPaths: [] as string[] };
  // An object that already exists is only counted as "already there" when its bytes are the same as the file's (size and sha256, read back through the server). Different bytes are a conflict and are never overwritten.
  const existsSame = async (r: any): Promise<boolean> => {
    try {
      const parts: Uint8Array[] = []; let total = 0;
      for (let ch = 0, chunks = 1; ch < chunks; ch++) { const g: any = await post(f, "backup-page", { source: "storage", full: true, target: "app", expect: opts.expect, action: "get", bucket: r.bucket, path: r.name, chunk: ch }); parts.push(Uint8Array.from(atob(g.b64), (c) => c.charCodeAt(0))); chunks = g.chunks; total = g.total; }
      const size = parts.reduce((n, p) => n + p.length, 0); if (size !== total || size !== Number(r.size)) return false;
      let bin = ""; for (const p of parts) for (let i = 0; i < p.length; i += 0x8000) bin += String.fromCharCode(...p.subarray(i, i + 0x8000));
      return !!r.sha256 && (await sha256Hex(bin)) === r.sha256; // no recorded hash = cannot be verified = not counted as present
    } catch { return false; }
  };
  const seen = async (r: any) => { if (await existsSame(r)) out.alreadyExisted++; else { out.conflicting++; out.failedPaths.push(`${r.bucket}/${r.name} (exists with different bytes)`); } };
  for (const r of rows) {
    if (!r.restorable || typeof r.b64 !== "string") { out.tooLarge++; continue; }
    progress(`Storage restore: ${out.written + out.alreadyExisted + out.failed}/${rows.length}`);
    try {
      if (Number(r.size) <= STORAGE_RESTORE_MAX) {
        const j: any = await post(f, "backup-restore-storage", { target: "app", confirmProject: opts.confirmProject, expect: opts.expect, bucket: r.bucket, path: r.name, mime: r.mime, b64: r.b64 });
        if (j.written) out.written++; else if (j.alreadyExisted) await seen(r); else { out.failed++; out.failedPaths.push(`${r.bucket}/${r.name}`); }
      } else {
        const j: any = await post(f, "backup-sign-storage", { target: "app", confirmProject: opts.confirmProject, expect: opts.expect, bucket: r.bucket, path: r.name });
        if (j.alreadyExisted) { await seen(r); continue; }
        if (!j.uploadUrl) { out.failed++; out.failedPaths.push(`${r.bucket}/${r.name}`); continue; }
        const bin = atob(r.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", new Blob([bytes], { type: r.mime || "application/octet-stream" }));
        const up = await f(j.uploadUrl, { method: "PUT", body: fd as any });
        if (up.ok) out.written++; else { out.failed++; out.failedPaths.push(`${r.bucket}/${r.name}`); }
      }
    }
    catch { out.failed++; out.failedPaths.push(`${r.bucket}/${r.name}`); }
  }
  return out;
}
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
