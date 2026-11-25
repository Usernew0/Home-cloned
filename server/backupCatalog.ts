/**
 * Database-level inventory for the owner backup. Reads the project's real catalog over a direct Postgres
 * connection (SUPABASE_DB_URL) inside ONE read-only, repeatable-read transaction (a consistent snapshot per call).
 * Pure over a `query(sql, params)` function so it can be tested on any Postgres.
 * Nothing here writes. Definitions come from the server's own pg_get_*def functions.
 */
export type Q = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export const CAPTURED_SCHEMAS = ["public", "auth", "storage"] as const;
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
export const isIdent = (s: unknown): s is string => typeof s === "string" && IDENT.test(s);
export const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

export type CatalogTable = { schema: string; name: string; kind: "r" | "p"; rls: boolean; forceRls: boolean; keys: string[]; columns: { name: string; type: string; notNull: boolean; default: string | null; identity: string; generated: string }[]; rowEstimate: number };
export type Catalog = {
  version: string;
  schemasCaptured: string[];
  schemasNotCaptured: string[];
  extensions: { name: string; schema: string; version: string }[];
  schemas: string[];
  types: { schema: string; name: string; kind: "enum" | "domain"; def: any }[];
  sequences: { schema: string; name: string; type: string; start: string; inc: string; min: string; max: string; cycle: boolean; last: string | null }[];
  tables: CatalogTable[];
  constraints: { schema: string; table: string; name: string; type: string; def: string }[];
  indexes: { schema: string; table: string; name: string; def: string }[];
  triggers: { schema: string; table: string; name: string; def: string }[];
  functions: { schema: string; name: string; args: string; def: string }[];
  views: { schema: string; name: string; materialized: boolean; def: string; deps: string[] }[];
  policies: { schema: string; table: string; name: string; permissive: boolean; cmd: string; roles: string[]; using: string | null; check: string | null }[];
  grants: { schema: string; table: string; grantee: string; privilege: string; grantable: boolean }[];
  /** Every object whose privileges are part of the access picture: tables, sequences, functions, schemas. hasAcl=false means the default (owner only, or the type's default). */
  acl: { kind: "table" | "sequence" | "function" | "schema"; schema: string; name: string; args: string; hasAcl: boolean; entries: { grantee: string; privilege: string; grantable: boolean }[] }[];
  defaultAcl: { role: string; schema: string | null; objtype: string; entries: { grantee: string; privilege: string; grantable: boolean }[] }[];
  /** Everything the snapshot knows it did NOT carry. Never empty: cluster-level objects are out of reach of a project connection. */
  notCarried: string[];
  /** Per-table write counters (inserts+updates+deletes) from the server statistics. Compared before and after an export to detect writes during it. */
  activity: Record<string, number>;
  /** Exact row counts at read time (count(*)), compared before and after an export. */
  rowCounts: Record<string, number>;
  partitioned: string[];
};

const SYS = "('pg_catalog','information_schema','pg_toast')";
const inScope = (col: string) => `${col} = any(array['public','auth','storage'])`;

export async function readCatalog(query: Q): Promise<Catalog> {
  const q = async (sql: string, p?: any[]) => (await query(sql, p)).rows as any[];
  const version = String((await q("select version() v"))[0]?.v || "");
  const allSchemas = (await q(`select nspname n from pg_namespace where nspname not in ${SYS} and nspname not like 'pg\\_%' order by 1`)).map((r) => r.n as string);
  const schemasCaptured = allSchemas.filter((s) => (CAPTURED_SCHEMAS as readonly string[]).includes(s));
  const schemasNotCaptured = allSchemas.filter((s) => !schemasCaptured.includes(s));
  const extensions = (await q(`select e.extname name, n.nspname schema, e.extversion version from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1`)) as any[];
  const types: Catalog["types"] = [];
  for (const r of await q(`select n.nspname s, t.typname n, array_agg(e.enumlabel::text order by e.enumsortorder)::text[] labels from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid where ${inScope("n.nspname")} group by 1,2 order by 1,2`)) types.push({ schema: r.s, name: r.n, kind: "enum", def: r.labels });
  for (const r of await q(`select n.nspname s, t.typname n, format_type(t.typbasetype, t.typtypmod) base, t.typnotnull nn, pg_get_expr(t.typdefaultbin, 0) def from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'd' and ${inScope("n.nspname")} order by 1,2`)) types.push({ schema: r.s, name: r.n, kind: "domain", def: { base: r.base, notNull: r.nn, default: r.def } });
  const sequences = (await q(`select s.schemaname schema, s.sequencename name, s.data_type::text type, s.start_value::text start, s.increment_by::text inc, s.min_value::text min, s.max_value::text max, s.cycle, s.last_value::text last from pg_sequences s where ${inScope("s.schemaname")} order by 1,2`)) as any[];
  const tabs = await q(`select c.oid::int oid, n.nspname s, c.relname n, c.relkind k, c.relrowsecurity rls, c.relforcerowsecurity frls, c.reltuples::bigint est from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and ${inScope("n.nspname")} and not c.relispartition and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by 2,3`);
  const tables: CatalogTable[] = [];
  for (const t of tabs) {
    const cols = await q(`select a.attname n, format_type(a.atttypid, a.atttypmod) t, a.attnotnull nn, pg_get_expr(d.adbin, d.adrelid) df, a.attidentity idn, a.attgenerated gen from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`, [t.oid]);
    const pk = await q(`select a.attname n from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.conrelid = $1 and c.contype = 'p' order by array_position(c.conkey, a.attnum)`, [t.oid]);
    tables.push({ schema: t.s, name: t.n, kind: t.k, rls: t.rls, forceRls: t.frls, keys: pk.map((x) => x.n), rowEstimate: Number(t.est), columns: cols.map((c) => ({ name: c.n, type: c.t, notNull: c.nn, default: c.df, identity: c.idn, generated: c.gen })) });
  }
  const oids = tabs.map((t) => t.oid);
  const nameOf = new Map(tabs.map((t) => [t.oid, { s: t.s, n: t.n }]));
  const constraints = (await q(`select conrelid::int rel, conname n, contype t, pg_get_constraintdef(oid, true) def from pg_constraint where conrelid = any($1::oid[]) and contype in ('p','u','f','c','x') order by case contype when 'p' then 0 when 'u' then 1 when 'x' then 1 when 'c' then 2 else 3 end, conname`, [oids])).map((r) => ({ schema: nameOf.get(r.rel)!.s, table: nameOf.get(r.rel)!.n, name: r.n, type: r.t, def: r.def }));
  const indexes = (await q(`select i.indrelid::int rel, c.relname n, pg_get_indexdef(i.indexrelid) def from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = any($1::oid[]) and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid) order by 2`, [oids])).map((r) => ({ schema: nameOf.get(r.rel)!.s, table: nameOf.get(r.rel)!.n, name: r.n, def: r.def }));
  const triggers = (await q(`select tgrelid::int rel, tgname n, pg_get_triggerdef(oid) def from pg_trigger where tgrelid = any($1::oid[]) and not tgisinternal order by 2`, [oids])).map((r) => ({ schema: nameOf.get(r.rel)!.s, table: nameOf.get(r.rel)!.n, name: r.n, def: r.def }));
  const functions = (await q(`select n.nspname "schema", p.proname "name", pg_get_function_identity_arguments(p.oid) args, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prokind in ('f','p') and ${inScope("n.nspname")} and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1,2,3`)) as any[];
  const views = (await q(`select c.oid::int oid, n.nspname "schema", c.relname "name", c.relkind = 'm' materialized, pg_get_viewdef(c.oid, true) def from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('v','m') and ${inScope("n.nspname")} and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by 2,3`)) as any[];
  const vdeps = await q(`select distinct v.oid::int v, rn.nspname || '.' || r.relname dep from pg_class v join pg_rewrite w on w.ev_class = v.oid join pg_depend d on d.objid = w.oid and d.classid = 'pg_rewrite'::regclass join pg_class r on r.oid = d.refobjid and d.refclassid = 'pg_class'::regclass join pg_namespace rn on rn.oid = r.relnamespace where v.relkind in ('v','m') and r.oid <> v.oid and r.relkind in ('v','m')`);
  for (const v of views) { v.deps = vdeps.filter((d) => d.v === v.oid).map((d) => d.dep); delete v.oid; }
  const policies = (await q(`select pol.polrelid::int rel, pol.polname n, pol.polpermissive perm, pol.polcmd cmd, coalesce((select array_agg(case when r = 0 then 'public' else (select rolname::text from pg_roles where oid = r) end)::text[] from unnest(pol.polroles) r), '{}'::text[]) roles, pg_get_expr(pol.polqual, pol.polrelid) using_, pg_get_expr(pol.polwithcheck, pol.polrelid) chk from pg_policy pol where pol.polrelid = any($1::oid[]) order by 2`, [oids])).map((r) => ({ schema: nameOf.get(r.rel)!.s, table: nameOf.get(r.rel)!.n, name: r.n, permissive: r.perm, cmd: r.cmd, roles: r.roles, using: r.using_, check: r.chk }));
  const G = `case when g.grantee = 0 then 'public' else g.grantee::regrole::text end`;
  const grants = (await q(`select c.oid::int rel, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_class c, aclexplode(c.relacl) g where c.oid = any($1::oid[]) order by 1,2,3`, [oids])).map((r) => ({ schema: nameOf.get(r.rel)!.s, table: nameOf.get(r.rel)!.n, grantee: r.grantee, privilege: r.pt, grantable: r.ig }));
  const aclRows = async (kind: string, sql: string) => {
    const m = new Map<string, any>();
    for (const r of await q(sql)) { const k = `${r.s}.${r.n}.${r.args ?? ""}`; if (!m.has(k)) m.set(k, { kind, schema: r.s, name: r.n, args: r.args ?? "", hasAcl: r.has, entries: [] }); if (r.pt) m.get(k).entries.push({ grantee: r.grantee, privilege: r.pt, grantable: r.ig }); }
    return [...m.values()];
  };
  const acl = [
    ...(await aclRows("table", `select n.nspname s, c.relname n, null::text args, c.relacl is not null has, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_class c join pg_namespace n on n.oid = c.relnamespace left join lateral aclexplode(c.relacl) g on true where c.oid = any(array[${oids.map(Number).join(",") || 0}]::oid[]) order by 1,2,5,6`)),
    ...(await aclRows("sequence", `select n.nspname s, c.relname n, null::text args, c.relacl is not null has, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_class c join pg_namespace n on n.oid = c.relnamespace left join lateral aclexplode(c.relacl) g on true where c.relkind = 'S' and ${inScope("n.nspname")} order by 1,2,5,6`)),
    ...(await aclRows("function", `select n.nspname s, p.proname n, oidvectortypes(p.proargtypes) args, p.proacl is not null has, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_proc p join pg_namespace n on n.oid = p.pronamespace left join lateral aclexplode(p.proacl) g on true where p.prokind in ('f','p') and ${inScope("n.nspname")} and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1,2,3,5,6`)),
    ...(await aclRows("schema", `select n.nspname s, n.nspname n, null::text args, n.nspacl is not null has, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_namespace n left join lateral aclexplode(n.nspacl) g on true where ${inScope("n.nspname")} order by 1,5,6`)),
  ];
  const defaultAcl: Catalog["defaultAcl"] = [];
  for (const r of await q(`select d.defaclrole::regrole::text role, case when d.defaclnamespace = 0 then null else (select nspname from pg_namespace where oid = d.defaclnamespace) end s, d.defaclobjtype::text ot, ${G} grantee, g.privilege_type pt, g.is_grantable ig from pg_default_acl d, aclexplode(d.defaclacl) g order by 1,2,3,4,5`)) {
    let e = defaultAcl.find((x) => x.role === r.role && x.schema === r.s && x.objtype === r.ot); if (!e) defaultAcl.push((e = { role: r.role, schema: r.s, objtype: r.ot, entries: [] }));
    e.entries.push({ grantee: r.grantee, privilege: r.pt, grantable: r.ig });
  }
  const act = await q(`select schemaname s, relname n, coalesce(n_tup_ins,0) + coalesce(n_tup_upd,0) + coalesce(n_tup_del,0) a from pg_stat_all_tables where ${inScope("schemaname")}`);
  const activity: Record<string, number> = Object.fromEntries(act.map((r) => [`${r.s}.${r.n}`, Number(r.a)]));
  const rowCounts: Record<string, number> = {};
  for (const t of tables) rowCounts[`${t.schema}.${t.name}`] = Number(((await q(`select count(*)::bigint n from ${qi(t.schema)}.${qi(t.name)}`))[0] as any).n);
  const partitioned = [...tabs.filter((t) => t.k === "p").map((t) => `${t.s}.${t.n}`), ...(await q(`select n.nspname || '.' || c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relispartition and ${inScope("n.nspname")}`)).map((r) => r.t)];
  const notCarried = [
    ...(partitioned.length ? [`Partitioned tables or partitions exist (${partitioned.slice(0, 5).join(", ")}): not restorable by this script, their rows are carried only for tables listed as plain tables`] : []),
    "Column-level privileges, large objects and per-role setting overrides are not read.",
    "Database roles and their passwords, and role memberships (cluster level: a project connection cannot export them). GRANT/policy lines name roles that must already exist on the destination.",
    "Extensions are listed by name and version; the destination must be able to install them. Objects owned by an extension are not copied.",
    "Event triggers, publications, foreign tables, rules, collations, casts, comments and column-level grants are not read.",
    "Tables in schemas other than public, auth and storage" + (schemasNotCaptured.length ? ` (found: ${schemasNotCaptured.join(", ")})` : "") + " are not read.",
    "Storage file contents come from the Storage API; storage.objects rows are only the database side.",
    "Dumping is not a pg_dump: object ownership, dependency order across unusual objects, and non-default storage parameters are not reproduced.",
  ];
  return { acl, defaultAcl, activity, rowCounts, partitioned, version, schemasCaptured, schemasNotCaptured, extensions, schemas: schemasCaptured, types, sequences, tables, constraints, indexes, triggers, functions, views, policies, grants, notCarried };
}

/** Stable key order for paging. Keyless tables are paged by ctid (physical order: only approximately stable under writes) and flagged. */
export const tableOrder = (t: CatalogTable) => (t.keys.length ? t.keys.map(qi).join(", ") : "ctid");

/** Column types whose value must not pass through a JavaScript number (bigint, numeric, floats, money) or a re-serialised JSON tree (json, jsonb). They travel as the database's own text and are cast back by the restore script, so they stay exact. */
export const exactAsText = (type: string) => /^(bigint|numeric|decimal|real|double precision|money|jsonb?)(\(.*\))?(\[\])*$/i.test(String(type).trim());
/** json/jsonb scalars are parsed back from their text in the restore script (a plain column of these types, not arrays). */
export const jsonText = (type: string) => /^jsonb?$/i.test(String(type).trim());
/** Rows as JSON, generated columns omitted (they cannot be restored). bytea/timestamps/numeric/jsonb come out as the server's own JSON text, so they round-trip through jsonb_populate_recordset. */
/** Numbers in JSON text that a JavaScript number cannot hold exactly (more than 15 significant digits). Strings are skipped. */
export function unsafeNumberCount(text: string): number {
  let n = 0; let i = 0; const L = text.length;
  while (i < L) {
    const ch = text[i];
    if (ch === '"') { i++; while (i < L && text[i] !== '"') i += text[i] === "\\" ? 2 : 1; i++; continue; }
    if (ch === "-" || (ch >= "0" && ch <= "9")) { let j = i + 1; while (j < L && /[0-9.eE+-]/.test(text[j])) j++; const tok = text.slice(i, j); const mant = tok.replace(/[eE].*$/, "").replace(/\D/g, "").replace(/^0+/, ""); if (mant.length > 15) n++; i = j; continue; }
    i++;
  }
  return n;
}
export async function readTablePage(query: Q, cat: Catalog, schema: string, name: string, offset: number, limit: number): Promise<{ rows: any[]; total: number; keyless: boolean; unsafeNumbers: number }> {
  const t = cat.tables.find((x) => x.schema === schema && x.name === name);
  if (!t) throw new Error("unknown table");
  const cols = t.columns.filter((c) => c.generated !== "s").map((c) => (exactAsText(c.type) ? `${qi(c.name)}::text as ${qi(c.name)}` : qi(c.name)));
  const from = `${qi(schema)}.${qi(name)}`;
  const texts: string[] = (await query(`select to_jsonb(r)::text j from (select ${cols.join(", ")} from ${from} order by ${tableOrder(t)} offset $1 limit $2) r`, [offset, limit])).rows.map((r: any) => String(r.j));
  const rows = texts.map((x) => JSON.parse(x)); const unsafeNumbers = texts.reduce((a, x) => a + unsafeNumberCount(x), 0);
  const total = Number(((await query(`select count(*)::bigint n from ${from}`)).rows[0] as any).n);
  return { rows, total, keyless: t.keys.length === 0, unsafeNumbers };
}

/** Run `fn` on a read-only, repeatable-read transaction (one consistent snapshot). */
export async function withReadOnly<T>(client: { query: Q }, fn: (q: Q) => Promise<T>): Promise<T> {
  await client.query("begin isolation level repeatable read read only");
  await client.query("set local search_path = pg_catalog"); // definitions come out fully schema-qualified
  try { return await fn((s, p) => client.query(s, p)); } finally { await client.query("rollback").catch(() => {}); }
}
