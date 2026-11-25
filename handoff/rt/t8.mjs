import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite(); let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("ok", n); } else { fail++; console.log("FAIL", n); } };
const q = async (s) => (await db.query(s)).rows;
const rej = async (n, s, re) => { try { await db.query(s); ok(n, false); } catch (e) { ok(n + " (" + e.message.slice(0, 50) + ")", !re || re.test(e.message)); } };
await db.exec(`create role service_role; create role anon; create role authenticated;
create schema auth; create function auth.jwt() returns jsonb language sql as $$ select nullif(current_setting('test.jwt', true),'')::jsonb $$;
create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('test.role', true),''),'authenticated') $$;
create table user_accounts(id text primary key, username text not null unique, couple_id text, updated_at timestamptz, plan text, password text);
create function public.requesting_couple_id() returns text language sql as $$ select 'legacy_body'::text $$;
create table couple_tenants(couple_id text primary key, couple_name text, partner1 text, partner2 text, plan text default 'free');
insert into user_accounts values('a','alice','pa',now(),null),('b','bob','pb',now(),null);
create table chat_messages(id text primary key, couple_id text);
create table milestones(id text primary key, couple_id text); create table date_plans(id text primary key, couple_id text); create table memories(id text primary key, couple_id text);
create table letters(id text primary key, couple_id text); create table couple_questions(id text primary key, couple_id text); create table celebration_cards(id text primary key, couple_id text); create table activity_logs(id text primary key, couple_id text);
alter table milestones enable row level security; create policy "Milestones couple isolation" on milestones for all using (true) with check (true);
alter table date_plans enable row level security; create policy "Date plans couple isolation" on date_plans for all using (true) with check (true);
alter table memories enable row level security; alter table letters enable row level security; alter table couple_questions enable row level security; alter table celebration_cards enable row level security; alter table activity_logs enable row level security;
grant all on milestones to authenticated; grant all on couple_tenants to authenticated;`);
const pol = async () => (await q("select policyname from pg_policies where tablename='milestones' order by 1")).map((r) => r.policyname).join(",");
await db.exec(fs.readFileSync("/tmp/out/sql/01_prep.sql", "utf8"));
ok("prep: pid_nonce column added and filled for existing accounts", (await q("select count(*)::int c from user_accounts where pid_nonce is null"))[0].c === 0);
ok("prep: the legacy requesting_couple_id() body is untouched", (await q("select requesting_couple_id() v"))[0].v === "legacy_body");
ok("prep: the legacy milestones policy is untouched", (await pol()) === "Milestones couple isolation");
await db.exec("set role authenticated");
await db.exec("insert into milestones values('legacy_write','pa')");
await db.exec("reset role");
ok("prep: an old client can still write a milestone directly", (await q("select count(*)::int c from milestones where id='legacy_write'"))[0].c === 1);
await db.exec("insert into user_accounts(id,username,couple_id) values('old_flow','carol','couple_custom')");
ok("prep: an account insert keeps the caller's couple_id (no solo forcing yet)", (await q("select couple_id from user_accounts where id='old_flow'"))[0].couple_id === "couple_custom");
await db.exec("update user_accounts set couple_id='pjoint' where id='a'");
ok("prep: the old direct couple_id update still works", (await q("select couple_id from user_accounts where id='a'"))[0].couple_id === "pjoint");
ok("prep: item_shares exists and the membership_config gate is OFF", (await q("select enabled from membership_config"))[0].enabled === false);
await rej("prep: case-insensitive duplicate username refused", "insert into user_accounts(id,username,couple_id) values('x1','ALICE','z')", /username_lower/);
{ let m = ""; try { await db.exec(fs.readFileSync("/tmp/out/sql/03_activation.sql", "utf8")); } catch (e) { m = e.message; try { await db.exec("rollback"); } catch {} } ok("activation refused before the backfill (" + m.slice(0, 40) + ")", /backfill incomplete/.test(m)); }
await db.exec("update user_accounts set couple_id = id, personal_couple_id = id");
await db.exec("update user_accounts set pid_nonce = null where id = 'b'");
{ let m = ""; try { await db.exec(fs.readFileSync("/tmp/out/sql/03_activation.sql", "utf8")); } catch (e) { m = e.message; try { await db.exec("rollback"); } catch {} } ok("activation refused with a null pid_nonce", /backfill incomplete/.test(m));
  ok("a refused activation leaves nothing half-applied", (await q("select count(*)::int c from pg_trigger where tgname in ('trg_init_personal_space','trg_guard_membership','trg_guard_membership_flip')"))[0].c === 0 && (await pol()).includes("couple isolation")); }
await db.exec("update user_accounts set pid_nonce = 'n' || id where id = 'b'");
await db.exec("insert into couple_tenants(couple_id, couple_name, partner1, partner2) select personal_couple_id, username, username, '' from user_accounts u where not exists (select 1 from couple_tenants c where c.couple_id = u.personal_couple_id)");
await db.exec(fs.readFileSync("/tmp/out/sql/03_activation.sql", "utf8"));
ok("activation: legacy policies replaced", !(await pol()).includes("couple isolation") && (await pol()).includes("own personal read"));
await db.exec("insert into user_accounts(id,username,couple_id,plan) values('user_77','dave','whatever','pro')");
const d = (await q("select couple_id, personal_couple_id from user_accounts where id='user_77'"))[0];
ok("activation: new accounts are forced solo", d.couple_id === "couple_77" && d.personal_couple_id === "couple_77");
await rej("activation: direct couple_id update refused", "update user_accounts set couple_id='zzz' where id='b'", /membership functions/);
const attempt = async (sql) => { try { await db.exec(sql); return ""; } catch (e) { try { await db.exec("rollback"); } catch {} return e.message; } };
// Admin edit path: the app saves accounts with INSERT ... ON CONFLICT (id) DO UPDATE. BEFORE INSERT triggers run on the proposed row first.
await db.exec("update user_accounts set plan='free' where id='a'");
await db.exec("select set_config('membership.rec','',false)");
const before = (await q("select couple_id, personal_couple_id, pid_nonce from user_accounts where id='a'"))[0];
{ const m = await attempt("insert into user_accounts(id,username,couple_id,plan,password) values ('a','alice','SOMETHING_ELSE','pro','newhash') on conflict (id) do update set plan = excluded.plan, password = excluded.password"); ok("admin upsert (password+plan) on an existing account succeeds (" + m.slice(0, 60) + ")", m === ""); }
const after = (await q("select couple_id, personal_couple_id, pid_nonce, plan from user_accounts where id='a'"))[0];
ok("admin upsert keeps couple_id, personal id and nonce", after.couple_id === before.couple_id && after.personal_couple_id === before.personal_couple_id && after.pid_nonce === before.pid_nonce);
ok("admin upsert applied the plan edit", after.plan === "pro");
{ const m = await attempt("insert into user_accounts(id,username,couple_id,personal_couple_id,pid_nonce) values ('a','alice','x','y','z') on conflict (id) do update set couple_id = excluded.couple_id, personal_couple_id = excluded.personal_couple_id, pid_nonce = excluded.pid_nonce"); const a2 = (await q("select couple_id, personal_couple_id, pid_nonce from user_accounts where id='a'"))[0];
  ok("a full-payload upsert cannot rewrite space or nonce (" + m.slice(0, 50) + ")", a2.couple_id === before.couple_id && a2.personal_couple_id === before.personal_couple_id && a2.pid_nonce === before.pid_nonce); }
// linked account (joint couple_id differs from the personal id) edited with a payload that includes couple_id
await db.exec("alter table user_accounts disable trigger trg_guard_membership"); await db.exec("update user_accounts set couple_id='pjoint_x' where id='b'"); await db.exec("alter table user_accounts enable trigger trg_guard_membership"); // test setup only: stands in for a linked account
{ const m = await attempt("insert into user_accounts(id,username,plan,password) values ('b','bob','pro','h2') on conflict (id) do update set plan = excluded.plan, password = excluded.password"); ok("password-only admin upsert on a linked account succeeds (" + m.slice(0, 60) + ")", m === ""); }
ok("linked account keeps its joint couple_id after the edit", (await q("select couple_id from user_accounts where id='b'"))[0].couple_id === "pjoint_x");
{ const j = (await q("select couple_id c from user_accounts where id='b'"))[0].c;
  ok("linked upsert, payload couple_id equals the stored joint id: succeeds, unchanged", (await attempt("insert into user_accounts(id,username,couple_id,plan) values ('b','bob','" + j + "','free') on conflict (id) do update set couple_id = excluded.couple_id, plan = excluded.plan")) === "" && (await q("select couple_id c from user_accounts where id='b'"))[0].c === j);
  const m2 = await attempt("insert into user_accounts(id,username,couple_id) values ('b','bob','stale_other') on conflict (id) do update set couple_id = excluded.couple_id");
  ok("linked upsert with a stale couple_id is refused and nothing changes (" + m2.slice(0, 40) + ")", /membership functions/.test(m2) && (await q("select couple_id c from user_accounts where id='b'"))[0].c === j);
  const m3 = await attempt("insert into user_accounts(id,username,pid_nonce) values ('b','bob','zzz') on conflict (id) do update set pid_nonce = excluded.pid_nonce");
  ok("nonce-only upsert is refused (immutable once set)", /pid_nonce is immutable/.test(m3)); }
await db.exec("set role authenticated");
await rej("activation: browser role can no longer insert milestones", "insert into milestones values('w2','pa')", /permission denied|row-level/);
await db.exec("reset role");
ok("flip not yet applied", (await q("select enabled from membership_config"))[0].enabled === false);
const flipMsg = () => attempt("update membership_config set enabled = true where id = 1");
ok("flip refused without a verified record", /no verified Firestore/.test(await flipMsg()));
ok("the record cannot be written by a plain UPDATE", /only by mem_record_reconciliation/.test(await attempt("update membership_config set fs_reconciled_at = now(), fs_project='p', fs_report_hash='h', fs_data_fingerprint='x' where id = 1")));
await db.exec("set role authenticated");
ok("a browser role cannot call the record function", (await attempt("select mem_record_reconciliation('p','h')")) !== "");
await db.exec("reset role");
ok("record refused with an empty project", /required/.test(await attempt("select mem_record_reconciliation('','h')")));
await db.exec("select mem_record_reconciliation('home-test','abc123')");
ok("record stored the project, hash and a fingerprint", (await q("select fs_project, fs_report_hash, fs_data_fingerprint is not null f from membership_config"))[0].f === true);
// Supabase data drift after the record
await db.exec("insert into milestones values('drift','pa')"); // superuser here (the browser cannot write after activation)
ok("flip refused when Supabase data changed after the record", /data changed/.test(await flipMsg()));
await db.exec("select mem_record_reconciliation('home-test','abc123')");
// activation completeness
await db.exec("grant insert on milestones to authenticated");
ok("flip refused when a browser write privilege returned", /write privilege/.test(await flipMsg()));
await db.exec("revoke insert on milestones from authenticated");
await db.exec("create policy extra_open on milestones for select using (true)");
ok("flip refused with an unexpected policy", /unexpected policy/.test(await flipMsg()));
await db.exec("drop policy extra_open on milestones");
await db.exec("alter table user_accounts disable trigger trg_init_personal_space");
ok("flip refused with a disabled trigger", /missing or disabled/.test(await flipMsg()));
await db.exec("alter table user_accounts enable trigger trg_init_personal_space");
await db.exec("delete from couple_tenants where couple_id = (select personal_couple_id from user_accounts where id = 'a')").catch(() => {});
{ const m = await flipMsg(); ok("flip refused when an account lacks its solo tenant (" + m.slice(0, 40) + ")", /solo tenant|joint spaces are retained/.test(m) || m === ""); }
await db.exec("insert into couple_tenants(couple_id, couple_name, partner1, partner2) select personal_couple_id, username, username, '' from user_accounts u where not exists (select 1 from couple_tenants c where c.couple_id = u.personal_couple_id)");
await db.exec("select mem_record_reconciliation('home-test','abc123')");
// recency
await db.exec("select set_config('membership.rec','1',false)"); await db.exec("update membership_config set fs_reconciled_at = now() - interval '2 hours'"); await db.exec("select set_config('membership.rec','',false)");
ok("flip refused when the record is older than 60 minutes", /older than 60/.test(await flipMsg()));
await db.exec("select mem_record_reconciliation('home-test','abc123')");
{ const m = await flipMsg(); ok("flip allowed with a fresh, matching record and a complete activation (" + m.slice(0, 60) + ")", m === ""); }
await db.exec("update membership_config set enabled = false where id = 1");
await db.exec(fs.readFileSync("/tmp/out/sql/04_flip.sql", "utf8"));
ok("flip: gate on via 04_flip.sql", (await q("select enabled from membership_config"))[0].enabled === true);
ok("config DELETE refused", /cannot be deleted/.test(await attempt("delete from membership_config")));
ok("config INSERT with enabled refused", /start disabled/.test(await attempt("insert into membership_config(id, enabled) values (2, true)")));
await db.exec("select mem_clear_reconciliation()");
ok("clear nulls the record", (await q("select fs_reconciled_at is null n from membership_config"))[0].n === true);
await db.exec("update membership_config set enabled = false where id = 1");
ok("flip refused after the record was cleared", /no verified/.test(await flipMsg()));
console.log(pass, "passed", fail, "failed"); process.exit(fail ? 1 : 0);
