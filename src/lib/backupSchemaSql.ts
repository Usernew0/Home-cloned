// Builds SQL-editor scripts from a catalog snapshot carried in the encrypted data copy.
// The definitions are the source server's own pg_get_*def output. The file is only trusted if it was written by this panel
// (authenticated encryption with the owner's passphrase); definition text is still checked for its expected statement prefix.
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
const qi = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
/** Fail closed: every fixed-tag DO block ($a$ $b$ $c$ $e$ $o$) must contain its own tag exactly twice (open and close). A name, definition or value that carries a tag would end the block early and run the rest as SQL. */
export function assertDollarSafe(sql: string): void {
  for (const tag of ["a", "b", "c", "e", "o"]) {
    const t = `$${tag}$`; const opens = (sql.match(new RegExp(`\\bdo \\$${tag}\\$`, "g")) || []).length; const all = sql.split(t).length - 1;
    if (all !== opens * 2) throw new Error("A name or definition in this file contains a SQL quoting marker. The script was not produced (nothing could be run).");
  }
}
/** Per-statement check, run when each statement is emitted: a DO block opened with a fixed tag must contain that tag exactly twice and must be the only DO block of the statement. A name, label, role or definition that carries the tag (even balanced, with a new DO opening) is refused. */
export function guardStatement(st: string): void {
  const m = /^\s*do \$([a-z])\$/.exec(st); if (!m) return; const t = `$${m[1]}$`;
  const opens = (st.match(new RegExp(`\\bdo \\$${m[1]}\\$`, "g")) || []).length;
  if (st.split(t).length - 1 !== 2 || opens !== 1) throw new Error("A name, label or definition in this file contains a SQL quoting marker. The script was not produced (nothing could be run).");
}
function guardedOut(): string[] { const a: string[] = []; const push = a.push.bind(a); (a as any).push = (...x: string[]) => { x.forEach(guardStatement); return push(...x); }; return a; }
const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const ok = (...n: string[]) => n.every((x) => IDENT.test(String(x)));
/** A fragment pasted into a statement must be one expression/definition: no statement separator and nothing that could close our own quoting. */
const frag = (v: unknown): v is string => typeof v === "string" && v.length < 20000 && !/;|\$b\$|\$c\$|\u0000/.test(v);
/** A function definition: exactly one dollar-quoted body; nothing outside the body may contain a statement separator. */
const fnOk = (d: unknown): d is string => {
  if (typeof d !== "string" || d.length > 500000 || !/^create (or replace )?(function|procedure) /i.test(d)) return false;
  const m = /\$([A-Za-z_]*)\$/.exec(d); if (!m) return false;
  const tag = m[0]; const start = m.index; const end = d.lastIndexOf(tag); if (end <= start) return false;
  return !/;/.test(d.slice(0, start)) && !/;/.test(d.slice(end + tag.length).replace(/;\s*$/, ""));
};
const one = (s: string) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, 160);

export function buildSchemaSql(cat: any, opts: { dryRun?: boolean } = {}): { sql: string; counts: Record<string, number>; skipped: string[]; mviews: string[] } {
  const out: string[] = guardedOut(); const skipped: string[] = []; const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] || 0) + 1; };
  const L = (...a: string[]) => out.push(...a);
  L(`-- SCHEMA RESTORE SCRIPT (idempotent: creates what is missing, replaces functions/policies/triggers/views). Run it in the SQL Editor of the destination project BEFORE the data script.`,
    `-- Source server: ${one(cat?.version)}`,
    `-- Roles named below (anon, authenticated, service_role, ...) must already exist on the destination. Role passwords are not in the file.`,
    `set check_function_bodies = off;`, "begin;", "set local search_path = pg_catalog; -- every definition in this file is schema-qualified",);
  for (const e of cat?.extensions || []) { if (!ok(e.name) || !ok(e.schema)) { skipped.push(`extension ${one(e.name)}`); continue; } L(`create extension if not exists ${qi(e.name)} with schema ${qi(e.schema)};`); bump("extensions"); }
  for (const s of cat?.schemas || []) { if (!ok(s)) continue; if (!["public", "auth", "storage"].includes(s)) continue; L(`create schema if not exists ${qi(s)};`); }
  for (const t of cat?.types || []) {
    if (!ok(t.schema, t.name)) { skipped.push(`type ${one(t.name)}`); continue; }
    if (t.kind === "enum" && Array.isArray(t.def)) { L(`do $b$ begin if not exists (select 1 from pg_type ty join pg_namespace n on n.oid = ty.typnamespace where n.nspname = ${lit(t.schema)} and ty.typname = ${lit(t.name)}) then create type ${qi(t.schema)}.${qi(t.name)} as enum (${t.def.map(lit).join(", ")}); end if; end $b$;`); bump("types"); }
    else if (t.kind === "domain" && t.def?.base) { L(`do $b$ begin if not exists (select 1 from pg_type ty join pg_namespace n on n.oid = ty.typnamespace where n.nspname = ${lit(t.schema)} and ty.typname = ${lit(t.name)}) then create domain ${qi(t.schema)}.${qi(t.name)} as ${String(t.def.base)}${t.def.notNull ? " not null" : ""}; end if; end $b$;`); bump("types"); }
  }
  for (const s of cat?.sequences || []) {
    if (!ok(s.schema, s.name)) { skipped.push(`sequence ${one(s.name)}`); continue; }
    const n = (v: any) => (/^-?\d+$/.test(String(v)) ? String(v) : "1");
    L(`create sequence if not exists ${qi(s.schema)}.${qi(s.name)} as ${/^(smallint|integer|bigint)$/.test(s.type) ? s.type : "bigint"} start with ${n(s.start)} increment by ${n(s.inc)} minvalue ${n(s.min)} maxvalue ${n(s.max)} ${s.cycle ? "cycle" : "no cycle"};`); bump("sequences");
  }
  const tableDefaults: string[] = []; const mviews: string[] = [];
  const fnDefs = (cat?.functions || []).filter((f: any) => f.schema === "public" && ok(f.schema, f.name) && fnOk(f.def));
  const platformFns = (cat?.functions || []).filter((f: any) => f.schema !== "public").length;
  if (platformFns) skipped.push(`${platformFns} function(s) in the auth/storage schemas are platform-owned: carried in the file for reference, not restored`);
  for (const f of (cat?.functions || [])) if (f.schema === "public" && !fnDefs.includes(f)) skipped.push(`function ${one(f.name)}`);
  for (const t of cat?.tables || []) {
    if (!ok(t.schema, t.name) || !(t.columns || []).every((c: any) => ok(c.name))) { skipped.push(`table ${one(t.schema)}.${one(t.name)} (name not a plain identifier)`); continue; }
    if (t.kind === "p" || (cat?.partitioned || []).includes(`${t.schema}.${t.name}`)) { skipped.push(`table ${one(t.name)} (partitioned: not restorable by this script)`); continue; }
    if (t.schema === "auth" || t.schema === "storage") { // platform-owned tables: created by the platform, never by this script
      L(`do $b$ begin if to_regclass(${lit(`${t.schema}.${t.name}`)}) is null then raise exception 'Platform table ${t.schema}.${t.name} does not exist on the destination. It is created by Supabase itself; use a Supabase project, not a bare Postgres.'; end if; end $b$;`); bump("platformTables"); continue;
    }
    if (!t.columns.every((c: any) => frag(c.type) && (c.default == null || frag(c.default)))) { skipped.push(`table ${one(t.name)} (a column type or default is not a single expression)`); continue; }
    const cols = t.columns.map((c: any) => {
      const gen = c.generated === "s" ? ` generated always as (${c.default}) stored` : "";
      const idn = c.identity === "a" ? " generated always as identity" : c.identity === "d" ? " generated by default as identity" : "";
      return `${qi(c.name)} ${c.type}${c.notNull ? " not null" : ""}${gen}${idn}`;
    });
    L(`create table if not exists ${qi(t.schema)}.${qi(t.name)} (${cols.join(", ")});`); bump("tables");
    for (const c of t.columns) if (c.generated !== "s" && !c.identity && c.default != null) tableDefaults.push(`alter table ${qi(t.schema)}.${qi(t.name)} alter column ${qi(c.name)} set default ${c.default};`);
  }
  // Functions come AFTER the tables (their argument and return types can be table row types); column defaults come after the functions (they can call them).
  for (const f of fnDefs) { L(String(f.def).replace(/^create function /i, "create or replace function ").replace(/^create procedure /i, "create or replace procedure ").replace(/\s*;?\s*$/, ";")); bump("functions"); }
  for (const d of tableDefaults) L(d);
  const scoped = (x: any) => ok(x.schema, x.table) && !["auth", "storage"].includes(x.schema);
  for (const c of cat?.constraints || []) {
    if (!scoped(c) || !frag(c.def)) { if (!["auth", "storage"].includes(c.schema)) skipped.push(`constraint ${one(c.name)}`); continue; }
    L(`do $b$ begin if not exists (select 1 from pg_constraint k where k.conname = ${lit(c.name)} and k.conrelid = to_regclass(${lit(`${c.schema}.${c.table}`)})) then alter table ${qi(c.schema)}.${qi(c.table)} add constraint ${qi(c.name)} ${String(c.def)}; end if; end $b$;`); bump("constraints");
  }
  for (const i of cat?.indexes || []) {
    if (!scoped(i)) continue; const d = String(i.def);
    if (!/^create (unique )?index /i.test(d) || !frag(d)) { skipped.push(`index ${one(i.name)}`); continue; }
    L(d.replace(/^create (unique )?index /i, (_m, u) => `create ${u || ""}index if not exists `) + ";"); bump("indexes");
  }
  const vlist: any[] = (cat?.views || []).filter((v: any) => ok(v.schema, v.name) && !["auth", "storage"].includes(v.schema));
  const vorder: any[] = []; const vseen = new Set<string>(); const vkey = (v: any) => `${v.schema}.${v.name}`;
  const visit = (v: any, stack: string[] = []) => { const k = vkey(v); if (vseen.has(k) || stack.includes(k)) return; for (const d of v.deps || []) { const x = vlist.find((y) => vkey(y) === d); if (x) visit(x, [...stack, k]); } vseen.add(k); vorder.push(v); };
  vlist.forEach((v) => visit(v));
  for (const v of vorder) {
    if (!frag(String(v.def).replace(/;\s*$/, ""))) { skipped.push(`view ${one(v.name)} (definition is not a single statement)`); continue; }
    L(`create or replace ${v.materialized ? "materialized " : ""}view ${qi(v.schema)}.${qi(v.name)} as ${String(v.def).replace(/;\s*$/, "")};`.replace("create or replace materialized view", "create materialized view if not exists").replace(/;$/, v.materialized ? " with no data;" : ";")); bump("views"); if (v.materialized) mviews.push(`refresh materialized view ${qi(v.schema)}.${qi(v.name)};`);
  }
  for (const g of cat?.triggers || []) {
    if (!scoped(g) || !/^create (constraint )?trigger /i.test(String(g.def)) || !frag(String(g.def).replace(/;\s*$/, ""))) { if (!["auth", "storage"].includes(g.schema)) skipped.push(`trigger ${one(g.name)}`); continue; }
    L(`drop trigger if exists ${qi(g.name)} on ${qi(g.schema)}.${qi(g.table)};`, String(g.def).replace(/;?\s*$/, ";")); bump("triggers");
  }
  for (const t of cat?.tables || []) {
    if (!ok(t.schema, t.name) || ["auth", "storage"].includes(t.schema)) continue;
    L(`alter table ${qi(t.schema)}.${qi(t.name)} ${t.rls ? "enable" : "disable"} row level security;`); if (t.forceRls) L(`alter table ${qi(t.schema)}.${qi(t.name)} force row level security;`);
  }
  const CMD: any = { r: "select", a: "insert", w: "update", d: "delete", "*": "all" };
  for (const p of cat?.policies || []) {
    if (!(ok(p.schema, p.table) && p.schema !== "auth") || !(p.roles || []).every((r: string) => r === "public" || IDENT.test(r)) || !CMD[p.cmd] || (p.using != null && !frag(p.using)) || (p.check != null && !frag(p.check))) { skipped.push(`policy ${one(p.name)}`); continue; }
    L(`drop policy if exists ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)};`,
      `create policy ${qi(p.name)} on ${qi(p.schema)}.${qi(p.table)} as ${p.permissive ? "permissive" : "restrictive"} for ${CMD[p.cmd]} to ${(p.roles.length ? p.roles : ["public"]).map((r: string) => (r === "public" ? "public" : qi(r))).join(", ")}${p.using ? ` using (${p.using})` : ""}${p.check ? ` with check (${p.check})` : ""};`); bump("policies");
  }
  // Access: restore must never leave broader access than the file says. For every object: revoke everything held by any role except the owner, then grant exactly what the file lists.
  const G = "case when g.grantee = 0 then 'public' else g.grantee::regrole::text end";
  const roleOk = (g: string) => g === "public" || IDENT.test(String(g).replace(/^"|"$/g, "")) || /^"[^"\u0000]{1,63}"$/.test(String(g));
  const roleSql = (g: string) => (g === "public" ? "public" : IDENT.test(String(g)) ? qi(String(g)) : /^"[^"\u0000]{1,63}"$/.test(String(g)) ? String(g) : "");
  let platformAcl = 0;
  for (const o of cat?.acl || []) {
    if (!ok(o.schema) || !["public"].includes(o.schema) && o.kind !== "schema" || (o.kind === "schema" && o.schema !== "public")) { platformAcl++; continue; }
    if (o.kind !== "schema" && !ok(o.name)) { skipped.push(`privileges of ${one(o.name)}`); continue; }
    if (o.kind === "function" && !frag(o.args)) { skipped.push(`privileges of function ${one(o.name)}`); continue; }
    const q1 = o.kind === "schema" ? qi(o.schema) : `${qi(o.schema)}.${qi(o.name)}`;
    const kw = o.kind === "function" ? "function" : o.kind === "sequence" ? "sequence" : o.kind === "schema" ? "schema" : "table";
    const objq = o.kind === "function" ? `${qi(o.schema)}.${qi(o.name)}(${o.args})` : q1;
    const src = o.kind === "function" ? `pg_proc c, aclexplode(c.proacl) g where c.oid = to_regprocedure(${lit(objq)}) and g.grantee <> c.proowner` : o.kind === "schema" ? `pg_namespace c, aclexplode(c.nspacl) g where c.nspname = ${lit(o.schema)} and g.grantee <> c.nspowner` : `pg_class c, aclexplode(c.relacl) g where c.oid = to_regclass(${lit(objq)}) and g.grantee <> c.relowner`;
    L(`do $a$ declare r text; begin for r in select distinct ${G} from ${src} loop execute format('revoke all on ${kw} %s from %s', ${lit(objq)}, r); end loop; end $a$;`);
    const ents = (o.entries || []).filter((e: any) => roleOk(e.grantee) && /^[A-Z ]+$/.test(String(e.privilege)));
    const list = o.kind === "function" && !o.hasAcl ? [{ grantee: "public", privilege: "EXECUTE", grantable: false }] : ents;
    for (const e of list) L(`do $a$ begin if ${e.grantee === "public" ? "true" : `exists (select 1 from pg_roles where rolname = ${lit(String(e.grantee).replace(/^"|"$/g, ""))})`} then grant ${e.privilege} on ${kw} ${objq} to ${roleSql(e.grantee)}${e.grantable ? " with grant option" : ""}; end if; end $a$;`);
    bump("privilegeObjects");
  }
  if (platformAcl) skipped.push(`${platformAcl} object(s) in the auth/storage schemas: privileges are platform-owned, carried in the file, not restored`);
  const OT: Record<string, string> = { r: "tables", S: "sequences", f: "functions", T: "types", n: "schemas" };
  for (const d of cat?.defaultAcl || []) {
    if (!OT[d.objtype] || !ok(String(d.role).replace(/^"|"$/g, "")) || (d.schema != null && !ok(d.schema))) { skipped.push("a default-privileges entry"); continue; }
    const ins = d.schema ? ` in schema ${qi(d.schema)}` : ""; const role = qi(String(d.role).replace(/^"|"$/g, ""));
    const ents = (d.entries || []).filter((e: any) => roleOk(e.grantee) && /^[A-Z ]+$/.test(String(e.privilege)));
    L(`do $a$ declare r text; begin if exists (select 1 from pg_roles where rolname = ${lit(String(d.role).replace(/^"|"$/g, ""))}) then
  for r in select distinct ${G} from pg_default_acl x, aclexplode(x.defaclacl) g where x.defaclrole = ${lit(String(d.role).replace(/^"|"$/g, ""))}::regrole and x.defaclnamespace = ${d.schema ? `${lit(d.schema)}::regnamespace` : "0"} and x.defaclobjtype = ${lit(d.objtype)}::"char" and g.grantee <> x.defaclrole loop execute format('alter default privileges for role ${role}${ins} revoke all on ${OT[d.objtype]} from %s', r); end loop;
  ${ents.map((e: any) => `execute 'alter default privileges for role ${role}${ins} grant ${e.privilege} on ${OT[d.objtype]} to ${roleSql(e.grantee)}${e.grantable ? " with grant option" : ""}';`).join(" ")}
end if; exception when insufficient_privilege then raise warning 'SKIPPED default privileges of role ${String(d.role).replace(/[^A-Za-z0-9_"]/g, "")}: this session has no authority over that role, so its default privileges were left as they are in the destination (check them in Database > Roles / run the script as that role)'; end $a$;`); bump("defaultPrivileges");
  }
  // Extras on the destination are not removed (a removed RESTRICTIVE policy would widen access). They are reported: the script stops if a restored table has policies or triggers the file does not list.
  for (const t of cat?.tables || []) {
    if (!ok(t.schema, t.name) || t.schema !== "public" || t.kind === "p") continue;
    const pol = (cat?.policies || []).filter((p: any) => p.schema === t.schema && p.table === t.name).map((p: any) => lit(p.name)); const trg = (cat?.triggers || []).filter((p: any) => p.schema === t.schema && p.table === t.name).map((p: any) => lit(p.name));
    L(`do $e$ declare x text; begin
  select string_agg(polname::text, ', ') into x from pg_policy where polrelid = to_regclass(${lit(`${qi(t.schema)}.${qi(t.name)}`)}) and polname::text <> all(array[${pol.join(", ")}]::text[]);
  if x is not null then raise exception 'Destination table ${t.name} has policies that are not in the backup: %. Remove them, or restore into a fresh project. Nothing was restored.', x; end if;
  select string_agg(tgname::text, ', ') into x from pg_trigger where tgrelid = to_regclass(${lit(`${qi(t.schema)}.${qi(t.name)}`)}) and not tgisinternal and tgname::text <> all(array[${trg.join(", ")}]::text[]);
  if x is not null then raise exception 'Destination table ${t.name} has triggers that are not in the backup: %. Remove them, or restore into a fresh project. Nothing was restored.', x; end if;
end $e$;`);
  }
  (out as any).mviews = mviews;
  L(opts.dryRun ? "rollback;" : "commit;");
  { const sql0 = out.join("\n") + "\n"; assertDollarSafe(sql0); return { sql: sql0, counts, skipped, mviews }; }
}

/** Row restore for any captured table (public, auth, storage) from the file. Columns are checked against the destination; generated columns are never written. */
export function buildCatalogDataSql(cat: any, rowsByTable: Record<string, any[]>, mode: "missing" | "overwrite", opts: { dryRun?: boolean } = {}): { sql: string; covered: string[]; skipped: string[] } {
  const out: string[] = guardedOut(); const covered: string[] = []; const skipped: string[] = [];
  out.push(`-- CATALOG DATA RESTORE (${mode === "missing" ? "insert missing rows only" : "OVERWRITE rows with the same primary key"}). Run AFTER the schema script, in the SQL Editor of the destination project.`, "begin;", "set local session_replication_role = replica;");
  const sorted = [...(cat?.tables || [])];
  for (const t of sorted) {
    const key = `${t.schema}.${t.name}`; const rows = rowsByTable[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    if (key === "storage.objects") { skipped.push("storage.objects rows are not inserted by SQL: the Storage upload creates each object row together with its bytes (a row without bytes would make the upload report already-exists)"); continue; }
    if (!ok(t.schema, t.name) || !t.columns.every((c: any) => ok(c.name))) { skipped.push(`${one(key)} (name not a plain identifier)`); continue; }
    if (rows.some((r: any) => r && r._omitted)) { skipped.push(`${key} (contains an oversize placeholder row)`); continue; }
    const cols = t.columns.filter((c: any) => c.generated !== "s").map((c: any) => c.name);
    const used = [...new Set(rows.flatMap((r: any) => Object.keys(r)))].filter((c) => cols.includes(c));
    if (used.length !== [...new Set(rows.flatMap((r: any) => Object.keys(r)))].length) { skipped.push(`${key} (file has columns the catalog does not list)`); continue; }
    let tag = "bk"; const json = JSON.stringify(rows); for (let i = 0; json.includes(`$${tag}$`); i++) tag = `bk${i}x`;
    const cl = used.map(qi).join(", "); const rel = `${qi(t.schema)}.${qi(t.name)}`;
    const sel = used.map((c) => { const col = t.columns.find((x: any) => x.name === c); return col && /^jsonb?$/i.test(String(col.type).trim()) ? `case when p.${qi(c)} is null then null else (p.${qi(c)} #>> '{}')::${/^jsonb$/i.test(String(col.type).trim()) ? "jsonb" : "json"} end as ${qi(c)}` : `p.${qi(c)}`; }).join(", ");
    const src = `select ${sel} from jsonb_populate_recordset(null::${rel}, $${tag}$${json}$${tag}$::jsonb) p`;
    out.push(`-- ${key}: ${rows.length} rows`);
    out.push(`do $c$ declare bad text; begin select string_agg(c, ', ') into bad from unnest(array[${used.map(lit).join(", ")}]) c where not exists (select 1 from information_schema.columns where table_schema = ${lit(t.schema)} and table_name = ${lit(t.name)} and column_name = c); if bad is not null then raise exception 'Destination ${key} lacks columns: %. Nothing was restored.', bad; end if; end $c$;`);
    const ins = `insert into ${rel} (${cl}) overriding system value`;
    if (t.keys.length && t.keys.every((k: string) => used.includes(k))) {
      const sets = used.filter((c) => !t.keys.includes(c)).map((c) => `${qi(c)} = excluded.${qi(c)}`);
      out.push(`${ins} ${src} on conflict (${t.keys.map(qi).join(", ")}) ${mode === "overwrite" && sets.length ? `do update set ${sets.join(", ")}` : "do nothing"};`);
    } else {
      if (mode === "overwrite") skipped.push(`${key} (no primary key: only rows not already present were added)`);
      out.push(`${ins} select ${cl} from (${src}) p where not exists (select 1 from ${rel} x where to_jsonb(x) - array[${t.columns.filter((c: any) => c.generated === "s").map((c: any) => lit(c.name)).join(", ")}]::text[] = to_jsonb(p));`);
    }
    covered.push(key);
  }
  if (!opts.dryRun) for (const s of cat?.sequences || []) if (ok(s.schema, s.name) && s.last != null && /^-?\d+$/.test(String(s.last))) out.push(`select setval(${lit(`${qi(s.schema)}.${qi(s.name)}`)}, greatest(${s.last}, (select last_value from ${qi(s.schema)}.${qi(s.name)})), true);`);
  out.push(opts.dryRun ? "rollback;" : "commit;");
  { const sql0 = out.join("\n") + "\n"; assertDollarSafe(sql0); return { sql: sql0, covered, skipped }; }
}

/** One script, one transaction: schema first, then every captured table's rows. Dry run ends in rollback. */
export function buildFullRestoreSql(file: { manifest: any; tables: Record<string, { rows: any[] }> }, mode: "missing" | "overwrite", dryRun: boolean): { sql: string; skipped: string[]; covered: string[] } {
  const cat = file.manifest?.catalog;
  const strip = (s: string) => s.split("\n").filter((l) => !/^(begin|commit|rollback);$/.test(l)).join("\n");
  const rows: Record<string, any[]> = {};
  for (const [k, v] of Object.entries(file.tables || {})) if (k.startsWith("pg_")) rows[k.slice(3)] = (v as any).rows || [];
  const a = buildSchemaSql(cat); const b = buildCatalogDataSql(cat, rows, mode, { dryRun });
  const head = `-- ${dryRun ? "DRY RUN of the " : ""}FULL RESTORE: schema, then data, in ONE transaction. SQL Editor of the destination project only.\n-- After running, open the Messages / Notices output of the SQL Editor: warnings such as SKIPPED default privileges appear only there.
-- WARNING: this script EXECUTES SQL definitions (functions, triggers, policies, views, defaults) that are stored in the backup file. Run it only if the file was made by you from your own project.\n-- ${dryRun ? "DRY RUN means the transaction ends in ROLLBACK and sequences are not touched. It still runs the DDL (taking locks) and installs extensions inside that transaction; rollback does not undo anything outside the database. It does not prove the real run behaves the same under different data or concurrent writes." : "This changes the destination database. Take a copy first if it is not empty."}\n-- Auth password hashes and storage.objects rows are included as stored; Storage file contents, roles, and role passwords are not.\n`;
  return { sql: head + "begin;\n" + strip(a.sql) + strip(b.sql) + (a.mviews.length ? "-- materialized views are filled after the data is in\n" + a.mviews.join("\n") + "\n" : "") + (dryRun ? "rollback;\n" : "commit;\n"), skipped: [...a.skipped, ...b.skipped], covered: b.covered };
}

/** Run AFTER the Storage upload. Uploads made with the service key leave owner empty; the app's hardened delete policy checks owner = auth.uid(), so the original uploader could not delete their media. This puts the original owner back on each object that now exists. Only owner and owner_id are touched. */
export function buildStorageOwnerSql(file: { tables: Record<string, { rows: any[] }> }): { sql: string; count: number } {
  const U = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = (file.tables?.["pg_storage.objects"]?.rows || []).filter((r: any) => r && typeof r.bucket_id === "string" && typeof r.name === "string" && (r.owner == null || U.test(String(r.owner))) && (r.owner_id == null || /^[A-Za-z0-9_.:-]{1,200}$/.test(String(r.owner_id))) && (r.owner != null || r.owner_id != null)).map((r: any) => ({ bucket_id: r.bucket_id, name: r.name, owner: r.owner ?? null, owner_id: r.owner_id ?? null }));
  const json = JSON.stringify(rows); let tag = "bk"; for (let i = 0; json.includes(`$${tag}$`) || json.includes(`$${tag}`) ; i++) tag = `bk${i}x`;
  const src = `jsonb_to_recordset($${tag}$${json}$${tag}$::jsonb) v(bucket_id text, name text, owner uuid, owner_id text)`;
  const sql = [`-- STORAGE OWNER RESTORE. Order: 1) SQL data script, 2) Storage upload in the panel, 3) this script. Run in the SQL Editor of the destination project.`, `-- It sets ONLY owner and owner_id (where empty) on objects that exist. Other object metadata (created_at, etag/metadata, version, user_metadata) is NOT preserved: Storage regenerates it on upload.`, "begin;",
    `update storage.objects o set owner = v.owner from ${src} where o.bucket_id = v.bucket_id and o.name = v.name and o.owner is null and v.owner is not null;`,
    `update storage.objects o set owner_id = v.owner_id from ${src} where o.bucket_id = v.bucket_id and o.name = v.name and o.owner_id is null and v.owner_id is not null;`,
    "commit;"].join("\n") + "\n";
  return { sql, count: rows.length };
}
