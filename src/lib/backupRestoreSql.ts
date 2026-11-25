import { BACKUP_TABLES, keysOf, SERIAL_TABLES } from "./backupKeys";
/** Builds a restore script from a decrypted backup file. The panel never runs it: the user reads it and runs it in the SQL Editor of the intended project.
 *  The file is untrusted input (anyone can craft one with their own passphrase), so: only tables on the fixed list, only plain column names, every value placed in a comment is JSON-escaped on one line,
 *  row data sits in a dollar-quoted jsonb literal whose tag is checked against the data.
 *  Mode "missing": inserts only rows whose key is absent. Mode "overwrite": rows with the same key are reset to the backup values (this also undoes legitimate later edits); tables without a unique key only get "missing".
 *  It is NOT an undo of the profile repair: rows created by later steps stay, and the script says so. */
export const RESTORE_ORDER = ["user_accounts", "profiles", "couple_tenants", "admin_settings", "memories", "date_plans", "milestones", "letters", "couple_questions", "activity_logs", "celebration_cards", "chat_messages", "item_shares", "membership_config", "membership_ops", "deleted_rows_backup"];
const FK_DO = (phase: "before" | "after") => `do $fk$ declare c record; n bigint; begin
  ${phase === "before" ? "create temp table if not exists _bk_fk(conname text, h text) on commit drop;" : ""}
  for c in select con.conname,
      con.conrelid::regclass::text as t, con.confrelid::regclass::text as rt,
      (select string_agg(format('c.%I = p.%I', a1.attname, a2.attname), ' and ') from unnest(con.conkey, con.confkey) k(ck, fk) join pg_attribute a1 on a1.attrelid = con.conrelid and a1.attnum = k.ck join pg_attribute a2 on a2.attrelid = con.confrelid and a2.attnum = k.fk) as j,
      (select string_agg(format('c.%I is not null', a1.attname), ' and ') from unnest(con.conkey) k(ck) join pg_attribute a1 on a1.attrelid = con.conrelid and a1.attnum = k.ck) as nn,
      (select string_agg(format('c.%I', a1.attname), ', ' order by k.ord) from unnest(con.conkey) with ordinality k(ck, ord) join pg_attribute a1 on a1.attrelid = con.conrelid and a1.attnum = k.ck) as cols
    from pg_constraint con join pg_namespace ns on ns.oid = con.connamespace
    where con.contype = 'f' and ns.nspname = 'public'
  loop
    ${phase === "before"
      ? "execute format('insert into _bk_fk select distinct %L, (row(%s))::text from %s c where %s and not exists (select 1 from %s p where %s)', c.conname, c.cols, c.t, c.nn, c.rt, c.j);"
      : "execute format('select count(*) from (select distinct (row(%s))::text h from %s c where %s and not exists (select 1 from %s p where %s)) o where not exists (select 1 from _bk_fk b where b.conname = %L and b.h = o.h)', c.cols, c.t, c.nn, c.rt, c.j, c.conname) into n; if n > 0 then raise exception 'Foreign key % would have % new invalid reference value(s) after this restore. Nothing was restored.', c.conname, n; end if;"}
  end loop;
end $fk$;`;
const q = (n: string) => `"${n.replace(/"/g, '""')}"`;
const lit = (n: string) => `'${n.replace(/'/g, "''")}'`;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** One-line, escaped, inert text for a SQL comment. */
export const safeComment = (v: unknown): string => JSON.stringify(String(v ?? "").slice(0, 120)).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");

export function buildRestoreSql(backup: { manifest: any; tables: Record<string, { rows: any[] }> }, mode: "missing" | "overwrite", tag = "", opts: { dryRun?: boolean } = {}): { sql: string; tablesCovered: string[]; skipped: string[] } {
  const m = backup?.manifest || {};
  const out: string[] = []; const covered: string[] = []; const skipped: string[] = [];
  const dry = !!opts.dryRun;
  out.push(`-- ${dry ? "DRY RUN of the " : ""}RESTORE SCRIPT (${mode === "missing" ? "insert missing rows only" : "OVERWRITE rows that have the same key"})`);
  if (dry) out.push("-- DRY RUN: identical to the real script but it ends in ROLLBACK and skips the sequence update, so it changes no data. A passing run proves it applies on THIS schema (columns, generated columns, triggers off, foreign keys); it does not prove the data is right.");
  out.push(`-- From a data copy dated ${safeComment(m.createdAt)}, source Supabase project ref ${safeComment(m.identity?.supabaseRef)} (taken from the file, NOT checked by this script).`);
  out.push(`-- Run it ONLY in the SQL Editor of that same project. Public tables only. Not restored: auth users, Storage files, Firestore, private 1:1 chat, chat of other couples.`);
  out.push(`-- THIS FILE CONTAINS PASSWORD HASHES AND 2FA SECRETS. Keep it private and delete it after use.`);
  out.push(`-- It is NOT an undo of the profile repair: rows created after the copy stay, and "overwrite" also undoes legitimate later edits to rows with the same key.`);
  out.push(`-- It runs as one transaction and stops with an error (nothing applied) if a column is missing or generated in the destination, or if triggers cannot be switched off.`);
  out.push(`-- Foreign key checks are switched off while rows go in. The script records which foreign key values have no parent before, and stops (nothing applied) if afterwards any value has no parent that was not already in that list.`);
  out.push("begin;");
  out.push(`do $trg$ begin set local session_replication_role = replica; exception when others then raise exception 'Cannot switch triggers off in this session (needs elevated rights). Nothing was restored.'; end $trg$;`);
  out.push(FK_DO("before"));
  const names = Object.keys(backup?.tables || {}).filter((k) => k.startsWith("supabase_")).map((k) => k.slice(9));
  const known = names.filter((n) => (BACKUP_TABLES as readonly string[]).includes(n));
  for (const n of names) if (!known.includes(n)) skipped.push(`${safeComment(n)} (not a table this panel exports; ignored)`);
  const ordered = [...RESTORE_ORDER.filter((n) => known.includes(n)), ...known.filter((n) => !RESTORE_ORDER.includes(n))];
  for (const t of ordered) {
    const rows = backup.tables["supabase_" + t]?.rows;
    if (!Array.isArray(rows) || !rows.length) { skipped.push(`${t} (no rows)`); continue; }
    if (rows.some((r: any) => !r || typeof r !== "object" || Array.isArray(r))) { skipped.push(`${t} (malformed rows)`); continue; }
    if (rows.some((r: any) => r._omitted)) { skipped.push(`${t} (contains an oversize placeholder row; not restorable)`); continue; }
    const keys = keysOf(t);
    if (!rows.every((r: any) => keys.every((k) => k in r && r[k] !== null))) { skipped.push(`${t} (key column ${keys.join("+")} missing)`); continue; }
    const cols = [...new Set(rows.flatMap((r: any) => Object.keys(r)))];
    if (!cols.every((c) => IDENT.test(c))) { skipped.push(`${t} (a column name is not a plain identifier)`); continue; }
    const json = JSON.stringify(rows);
    let tg = tag || "bk"; for (let i = 0; json.includes(`$${tg}$`); i++) tg = `bk${i}x`;
    const colList = cols.map(q).join(", ");
    const arr = `array[${cols.map(lit).join(", ")}]`;
    out.push(`-- ${t}: ${rows.length} rows`);
    out.push(`do $chk$ declare bad text; begin
  select string_agg(c, ', ') into bad from unnest(${arr}) c where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = ${lit(t)} and column_name = c);
  if bad is not null then raise exception 'Destination table ${t} lacks columns from the backup: %. Nothing was restored.', bad; end if;
  select string_agg(column_name, ', ') into bad from information_schema.columns where table_schema = 'public' and table_name = ${lit(t)} and column_name = any(${arr}) and (is_generated = 'ALWAYS' or identity_generation = 'ALWAYS');
  if bad is not null then raise exception 'Destination table ${t} has generated columns that cannot be restored: %. Nothing was restored.', bad; end if;
end $chk$;`);
    const src = `select ${colList} from jsonb_populate_recordset(null::public.${q(t)}, $${tg}$${json}$${tg}$::jsonb) as p`;
    const overwriteOk = mode === "overwrite" && keys.length === 1;
    if (mode === "overwrite" && !overwriteOk) skipped.push(`${t} (no single unique key: only missing rows were added, nothing overwritten)`);
    if (overwriteOk) {
      const sets = cols.filter((c) => c !== keys[0]).map((c) => `${q(c)} = excluded.${q(c)}`);
      out.push(`insert into public.${q(t)} (${colList}) ${src} on conflict (${q(keys[0])}) ${sets.length ? `do update set ${sets.join(", ")}` : "do nothing"};`);
    } else {
      out.push(`insert into public.${q(t)} (${colList}) select ${colList} from (${src}) as p where not exists (select 1 from public.${q(t)} x where ${keys.map((k) => `x.${q(k)} = p.${q(k)}`).join(" and ")});`);
    }
    if (SERIAL_TABLES[t] && !dry) out.push(`select setval(pg_get_serial_sequence('public.${t}', '${SERIAL_TABLES[t]}'), (select max(${q(SERIAL_TABLES[t])}) from public.${q(t)}));`);
    covered.push(t);
  }
  out.push(FK_DO("after"));
  out.push(dry ? "rollback;" : "commit;");
  return { sql: out.join("\n") + "\n", tablesCovered: covered, skipped };
}
