import React, { useEffect, useRef, useState } from "react";
import { Database, Download, Loader2, ShieldAlert, CheckCircle2, AlertTriangle, KeyRound, FileCheck2 } from "lucide-react";
import { planExpect, buildManifest, checkIdentity, fetchPlan, restoreFirestoreDocs, runExport, verifyBackup, type TableReport } from "../lib/backupClient";
import { toCsvZip, toJson, toNdjson } from "../lib/backupFormats";
import { decryptText, encryptText } from "../lib/backupCrypto";
import { buildRestoreSql } from "../lib/backupRestoreSql";

type Mode = "readable" | "full";
type Format = "json" | "ndjson" | "csv";
const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "json", label: "JSON (one file)", hint: "Easiest to read and re-use" },
  { id: "ndjson", label: "NDJSON (one file)", hint: "One record per line, good for big data and scripts" },
  { id: "csv", label: "CSV (ZIP, one file per table)", hint: "Opens in Excel / Google Sheets" },
];
const inputCls = "w-full rounded-xl bg-neutral-900 border border-white/10 px-3 py-2 text-xs text-white font-mono";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const BackupDataSection: React.FC = () => {
  const [target, setTarget] = useState<"app" | "separate">("app");
  const [confirmCred, setConfirmCred] = useState("");
  const [fsConfirm, setFsConfirm] = useState("");
  const [fsMsg, setFsMsg] = useState("");
  const fileRef = useRef<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [planError, setPlanError] = useState("");
  const [supabase, setSupabase] = useState(true);
  const [firestore, setFirestore] = useState(true);
  const [mode, setMode] = useState<Mode>("readable");
  const [format, setFormat] = useState<Format>("json");
  const [expSb, setExpSb] = useState("");
  const [expFs, setExpFs] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [reports, setReports] = useState<TableReport[] | null>(null);
  const [error, setError] = useState("");
  const [vFile, setVFile] = useState<File | null>(null);
  const [vPass, setVPass] = useState("");
  const [vResult, setVResult] = useState<{ ok: boolean; problems: string[]; checked: number; ref: string; fs: string; at: string } | null>(null);
  const [vError, setVError] = useState("");

  useEffect(() => {
    let live = true;
    setPlan(null); setPlanError("");
    fetchPlan(target).then((p) => { if (live) { setPlan(p); setFirestore(!!p?.firestore?.available); } }).catch((e) => live && setPlanError(String(e?.message || "Could not load the export plan")));
    return () => { live = false; fileRef.current = null; };
  }, [target]);

  const sources = { supabase, firestore: firestore && !!plan?.firestore?.available };
  const full = mode === "full";
  const passOk = !full || (pass.length >= 12 && pass === pass2 && confirmCred === "INCLUDE CREDENTIALS");

  const start = async () => {
    setBusy(true); setError(""); setReports(null); setProgress("Starting");
    try {
      const id = checkIdentity(plan, sources, { supabaseRef: expSb, firestoreProject: expFs });
      if (!id.ok) { setError(id.message); return; }
      const { tables, reports: reps } = await runExport(sources, plan, undefined, setProgress, { full, target });
      setReports(reps);
      if (!tables.length) { setError("Nothing was read, so no file was made."); return; }
      const manifest = buildManifest(sources, reps, plan, { full, identityChecked: id.checked, target });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const tag = [sources.supabase ? plan?.supabase?.ref : "", sources.firestore ? plan?.firestore?.project : ""].filter(Boolean).join("_");
      if (full) {
        const byName: Record<string, { rows: any[] }> = {}; for (const t of tables) byName[t.name] = { rows: t.rows };
        const enc = await encryptText(JSON.stringify({ manifest, tables: byName }), pass);
        download(`home-data-ENCRYPTED-COPY-${tag}-${stamp}.hbk.json`, enc, "application/json");
      } else if (format === "json") download(`home-data-EXPORT-${tag}-${stamp}.json`, toJson(manifest, tables), "application/json");
      else if (format === "ndjson") download(`home-data-EXPORT-${tag}-${stamp}.ndjson`, toNdjson(manifest, tables), "application/x-ndjson");
      else download(`home-data-EXPORT-${tag}-${stamp}.zip`, toCsvZip(manifest, tables), "application/zip");
    } catch (e: any) { setError(String(e?.message || "Export failed")); }
    finally { setBusy(false); setProgress(""); }
  };

  const verify = async () => {
    if (!vFile) return;
    setVError(""); setVResult(null); setBusy(true);
    try {
      const file = JSON.parse(await decryptText(await vFile.text(), vPass));
      const r = await verifyBackup(file);
      fileRef.current = file; setVResult({ ...r, ref: file.manifest?.identity?.supabaseRef || "", fs: file.manifest?.identity?.firestoreProject || "", at: file.manifest?.createdAt || "" });
    } catch (e: any) { setVError(String(e?.message || "Could not verify the file")); }
    finally { setBusy(false); }
  };
  const restoreSql = (m: "missing" | "overwrite" | "dry") => {
    if (!vResult || !fileRef.current) return;
    const { sql, skipped } = buildRestoreSql(fileRef.current, m === "dry" ? "missing" : m, "", { dryRun: m === "dry" });
    download(`restore-${m === "dry" ? "DRYRUN" : m}-${(vResult.ref || "unknown").replace(/[^A-Za-z0-9_-]/g, "_")}.sql`, sql, "text/plain");
    if (skipped.length) setVError(`Not in the script: ${skipped.join("; ")}`);
  };
  const clearFile = () => { fileRef.current = null; setVResult(null); setVFile(null); setVPass(""); setFsMsg(""); };
  const restoreFs = async () => {
    if (!fileRef.current || !plan) return;
    if (!window.confirm(`Write the Firestore documents from this file into project ${fsConfirm}? Existing documents are not changed.`)) return;
    setBusy(true); setFsMsg("Working");
    try { const t = await restoreFirestoreDocs(fileRef.current, { target, confirmProject: fsConfirm, mode: "missing", expect: planExpect(plan) }, undefined, setFsMsg); setFsMsg(`Firestore: ${t.written} created, ${t.alreadyExisted} already existed, ${t.failed} failed of ${t.documents}.${t.failed ? " Failed: " + t.failedPaths.join(", ") : ""}`); }
    catch (e: any) { setFsMsg(String(e?.message || "Firestore restore failed")); } finally { setBusy(false); }
  };

  const problems = reports?.filter((r) => r.status === "failed" || r.status === "count mismatch" || r.oversizeRows > 0) || [];
  const excludedTotal = reports?.reduce((a, r) => a + r.excludedPrivate, 0) || 0;
  return (
    <div className="flex flex-col gap-5" data-testid="backup-data-section">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/25 rounded-2xl text-emerald-400"><Database className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-serif font-bold text-white tracking-wide">Backup Data</h2>
          <p className="text-xs text-neutral-400">Copy Supabase and Firestore data from the project THIS site is connected to.</p>
        </div>
      </div>

      {plan && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-100 leading-relaxed" data-testid="source-identity">
          <div className="font-semibold mb-1">Connected sources (this is what will be copied)</div>
          {plan.targets?.length > 1 && (
            <select className={inputCls + " mb-2"} value={target} onChange={(e) => setTarget(e.target.value as any)} disabled={busy} data-testid="target-select">
              {plan.targets.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          {target === "separate" && <div className="mb-2 text-amber-200">Separate source: read-only. Chat is not backed up from it (all chat rows are left out), and nothing can be written back to it from this panel. Not a snapshot.</div>}
          <div className="font-mono break-all">Supabase project: <b>{plan.supabase?.ref || "unknown"}</b></div>
          <div className="font-mono break-all">Firestore project: <b>{plan.firestore?.project || "not set"}</b></div>
          <div className="mt-1 text-sky-200/80">Check these against the project you mean to copy. Optionally type what you expect below: a mismatch stops the export.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <input className={inputCls} placeholder="Expected Supabase project ref (optional)" value={expSb} onChange={(e) => setExpSb(e.target.value)} disabled={busy} />
            <input className={inputCls} placeholder="Expected Firestore project id (optional)" value={expFs} onChange={(e) => setExpFs(e.target.value)} disabled={busy} />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 leading-relaxed flex gap-3">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Chat is NOT backed up here: private 1:1 messages and other couples' chat are never copied. Only a fixed list of 17 public Supabase tables and the known top-level Firestore collections are read. Not included: schema, policies, auth users, Storage files, Firestore rules. Tables are read one after another, not in one snapshot. Keep every file private.
        </div>
      </div>

      {planError && <div className="text-xs text-red-300">{planError}</div>}
      {!plan && !planError && <div className="text-xs text-neutral-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking what can be exported</div>}

      {plan && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4 flex gap-3 cursor-pointer">
            <input type="checkbox" checked={supabase} onChange={(e) => setSupabase(e.target.checked)} disabled={busy || !plan.supabase?.available} />
            <span className="text-sm text-white">Supabase<span className="block text-[11px] text-neutral-400">{plan.supabase?.available ? `${plan.supabase.tables.length} tables checked, missing ones are skipped` : "Not available on the server"}</span></span>
          </label>
          <label className={`rounded-2xl border border-white/10 bg-neutral-950/60 p-4 flex gap-3 ${plan.firestore?.available ? "cursor-pointer" : "opacity-70"}`}>
            <input type="checkbox" checked={sources.firestore} onChange={(e) => setFirestore(e.target.checked)} disabled={busy || !plan.firestore?.available} />
            <span className="text-sm text-white">Firestore<span className="block text-[11px] text-neutral-400">{plan.firestore?.available ? `${plan.firestore.collections.length} known top-level collections (nested collections are reported, not exported)${plan.firestore.notExported?.length ? `. NOT exported, needs a decision: ${plan.firestore.notExported.join(", ")}` : ""}` : plan.firestore?.note || "Not available"}</span></span>
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={() => setMode("readable")} className={`text-left rounded-2xl border p-4 ${mode === "readable" ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-neutral-950/60"}`}>
          <div className="text-sm font-semibold text-white">Readable export</div>
          <div className="text-[11px] text-neutral-400">Secrets removed. For reading and sharing with tools. Cannot restore logins. Not a backup.</div>
        </button>
        <button type="button" disabled={busy} onClick={() => setMode("full")} className={`text-left rounded-2xl border p-4 ${mode === "full" ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-neutral-950/60"}`}>
          <div className="text-sm font-semibold text-white flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> Encrypted data copy</div>
          <div className="text-[11px] text-neutral-400">Keeps credentials (password hashes, 2FA) so rows can be put back. Locked with your passphrase. File integrity can be checked here; recovery has not been tested on a real project.</div>
        </button>
      </div>

      {!full && (
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" disabled={busy} onClick={() => setFormat(f.id)} title={f.hint}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${format === f.id ? "bg-emerald-600 text-white border-emerald-400" : "bg-neutral-900 text-neutral-300 border-white/10 hover:text-white"}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {full && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="password" className={inputCls} placeholder="Passphrase (12+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} disabled={busy} autoComplete="new-password" />
          <input type="password" className={inputCls} placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} disabled={busy} autoComplete="new-password" />
          <p className="sm:col-span-2 text-[11px] text-amber-200">The passphrase is not stored anywhere. If it is lost the file cannot be opened. Before encryption the credentials pass through your browser in plain form (HTTPS, not cached).</p>
          <input className={inputCls + " sm:col-span-2"} placeholder="Type INCLUDE CREDENTIALS to confirm the file will hold password hashes and 2FA secrets" value={confirmCred} onChange={(e) => setConfirmCred(e.target.value)} disabled={busy} />
        </div>
      )}

      <div>
        <button type="button" onClick={start} disabled={busy || !plan || !passOk || (!supabase && !sources.firestore)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {busy ? "Working" : full ? "Make encrypted copy" : "Export and download"}
        </button>
        {busy && <p className="text-[11px] text-neutral-400 mt-2 font-mono">{progress}</p>}
      </div>

      {error && <div className="text-xs text-red-300" data-testid="backup-error">{error}</div>}
      {reports && (
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
          <div className={`text-xs font-semibold flex items-center gap-2 mb-2 ${problems.length ? "text-amber-300" : "text-emerald-300"}`}>
            {problems.length ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {problems.length ? `${problems.length} item(s) need attention, the file only holds what was read` : "Every listed table was read without a reported problem"}
          </div>
          {excludedTotal > 0 && <div className="text-[11px] text-neutral-400 mb-1">{excludedTotal} private chat rows were left out on purpose.</div>}
          <div className="max-h-56 overflow-auto text-[11px] font-mono text-neutral-300 space-y-0.5">
            {reports.map((r) => (
              <div key={r.name} className={r.status === "ok" ? "" : r.status === "skipped" ? "text-neutral-500" : "text-amber-300"}>
                {r.name}: {r.rows} rows, {r.status}{r.detail ? ` (${r.detail})` : ""}{r.removedColumns.length ? `, removed: ${r.removedColumns.join(" ")}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4 flex flex-col gap-2" data-testid="verify-box">
        <div className="text-sm font-semibold text-white flex items-center gap-2"><FileCheck2 className="w-4 h-4" /> Check an encrypted copy (file integrity only)</div>
        <p className="text-[11px] text-amber-200" data-testid="verify-needs-encrypted">Needs a file made with Encrypted data copy, plus its passphrase. A Readable export cannot be checked or restored: its secrets were removed.</p>
        <p className="text-[11px] text-neutral-400">Opens the file here, recomputes every table hash and shows which project it came from. This proves the file is intact, not that it matches the source or restores cleanly. The restore script is not run by this panel and has been tested only on a synthetic database.</p>
        <input type="file" accept=".json" className="text-xs text-neutral-300" onChange={(e) => { setVFile(e.target.files?.[0] || null); setVResult(null); }} disabled={busy} />
        <input type="password" className={inputCls} placeholder="Passphrase" value={vPass} onChange={(e) => setVPass(e.target.value)} disabled={busy} autoComplete="off" />
        <button type="button" onClick={verify} disabled={busy || !vFile || !vPass} className="self-start px-4 py-2 rounded-xl bg-neutral-800 text-white text-xs font-semibold disabled:opacity-50">Check file</button>
        {vError && <div className="text-xs text-red-300">{vError}</div>}
        {vResult && (
          <div className="text-[11px] font-mono text-neutral-300 space-y-1" data-testid="verify-result">
            <div className={vResult.ok ? "text-emerald-300" : "text-amber-300"}>{vResult.ok ? `File is intact: ${vResult.checked} tables match their hashes.` : "File has problems:"}</div>
            {vResult.problems.map((p, i) => <div key={i} className="text-amber-300">{p}</div>)}
            <div>Taken {vResult.at || "?"} from Supabase <b>{vResult.ref || "?"}</b>{vResult.fs ? <> and Firestore <b>{vResult.fs}</b></> : null}</div>
            {vResult.ok && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={clearFile} className="px-3 py-1.5 rounded-lg bg-neutral-700 text-white">Clear file from memory</button>
                <button type="button" onClick={() => restoreSql("dry")} className="px-3 py-1.5 rounded-lg bg-sky-800 text-white">Dry-run script (changes nothing, ends in rollback)</button>
                <button type="button" onClick={() => restoreSql("missing")} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white">Restore script: add missing rows only</button>
                <button type="button" onClick={() => restoreSql("overwrite")} className="px-3 py-1.5 rounded-lg bg-red-800 text-white">Restore script: overwrite same-id rows</button>
              </div>
            )}
            {vResult.ok && vResult.fs && target === "app" && (
              <div className="pt-2 space-y-1 border-t border-white/10 mt-2">
                <div className="text-neutral-400">Firestore documents in this file can be written back (new documents only, nothing existing is changed; membership, chat and unknown collections are refused). Never run against a real project during this build's tests.</div>
                <input className={inputCls} placeholder="Type the Firestore project id to write into" value={fsConfirm} onChange={(e) => setFsConfirm(e.target.value)} disabled={busy} />
                <button type="button" onClick={restoreFs} disabled={busy || !fsConfirm} className="px-3 py-1.5 rounded-lg bg-red-800 text-white disabled:opacity-50">Write missing Firestore documents</button>
                {fsMsg && <div>{fsMsg}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
