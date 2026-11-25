import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
await db.exec(`create role service_role; create role anon; create role authenticated;
create schema auth; create function auth.jwt() returns jsonb language sql as $$ select nullif(current_setting('test.jwt', true),'')::jsonb $$;
create table user_accounts(id text primary key, couple_id text, updated_at timestamptz, pid_nonce text, username text, plan text);
create table couple_tenants(couple_id text primary key, couple_name text, partner1 text, partner2 text, plan text);
insert into user_accounts values('a','pa',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),('b','pb',now(),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),('c','pc',now(),'cccccccccccccccccccccccccccccccc');`);
await db.exec(fs.readFileSync("/tmp/out/membership_draft.sql","utf8"));
await db.exec(`update user_accounts set personal_couple_id = couple_id where id in ('a','b')`); // c has none
let pass=0, fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log("ok",n)}else{fail++;console.log("FAIL",n)} };
const rej=async(n,q,re)=>{ try{await db.query(q);ok(n,false)}catch(e){ok(n+" ("+e.message.slice(0,50)+")", !re||re.test(e.message))} };
const J=(x)=>JSON.stringify(x);
await rej("direct couple_id update refused","update user_accounts set couple_id='zzz' where id='a'",/membership functions/);
await rej("personal id immutable","update user_accounts set personal_couple_id='x' where id='a'",/immutable/);
await rej("personal id cannot clear","update user_accounts set personal_couple_id=null where id='a'",/immutable/);
await rej("epoch cannot decrease","update user_accounts set membership_epoch=-1 where id='a'",/epoch/);
await rej("link same account twice","select mem_reserve('tx-aaaa01','link','a','a',null,null)",/two distinct/);
await rej("link account without personal id","select mem_reserve('tx-aaaa01','link','a','c',null,null)",/personal space id/);
await rej("unknown account","select mem_reserve('tx-aaaa01','link','a','zz',null,null)",/unknown/);
await rej("unlink unknown couple","select mem_reserve('tx-aaaa01','unlink',null,null,'pa',null)",/no linked/);
let op=(await db.query(`select mem_reserve('tx-link001','link','b','a',null,'Us') r`)).rows[0].r;
ok("derived to-space from pair_key, caller cannot choose", op.to_spaces.a===op.to_spaces.b && op.to_spaces.a.startsWith("joint_") && op.pair_key==="a|b");
await rej("second op on same account refused","select mem_reserve('tx-link002','link','a','b',null,null)",/duplicate|unique/);
await rej("commit before frozen","select mem_commit('tx-link001',1)",/not fs_frozen/);
await rej("done straight from reserved","select mem_advance('tx-link001',1,'reserved','done')",/illegal/);
await rej("wrong from-state","select mem_advance('tx-link001',1,'fs_frozen','aborting')",/stale/);
let f=(await db.query(`select mem_advance('tx-link001',1,'reserved','fs_frozen') f`)).rows[0].f;
await rej("stale fence","select mem_advance('tx-link001',1,'fs_frozen','aborting')",/stale/);
await rej("direct abort skipping aborting refused","select mem_advance('tx-link001',2,'fs_frozen','aborted')",/illegal/);
f=(await db.query(`select mem_commit('tx-link001',${f}) f`)).rows[0].f;
ok("accounts moved + epoch", J((await db.query(`select id,couple_id,membership_epoch from user_accounts where id in('a','b') order by id`)).rows).includes('"membership_epoch":1'));
await rej("no abort after commit",`select mem_advance('tx-link001',${f},'db_committed','aborting')`,/illegal/);
await rej("no done before activation",`select mem_advance('tx-link001',${f},'db_committed','done')`,/illegal/);
await rej("direct update after commit still refused","update user_accounts set couple_id='pa' where id='a'",/membership functions/);
f=(await db.query(`select mem_advance('tx-link001',${f},'db_committed','fs_active') f`)).rows[0].f;
await db.query(`select mem_advance('tx-link001',${f},'fs_active','done')`);
ok("locks released only at done",(await db.query(`select count(*)::int c from membership_op_locks`)).rows[0].c===0);
const joint=op.to_spaces.a;
await rej("delete retained tenant refused",`delete from couple_tenants where couple_id='${joint}'`,/retained/);
await rej("relink while linked refused","select mem_reserve('tx-link003','link','a','b',null,null)",/not on its personal/);
// unlink derives personal ids
op=(await db.query(`select mem_reserve('tx-unlk001','unlink',null,null,'${joint}',null) r`)).rows[0].r;
ok("unlink to-spaces are each personal id", op.to_spaces.a==="pa" && op.to_spaces.b==="pb");
f=(await db.query(`select mem_advance('tx-unlk001',1,'reserved','fs_frozen') f`)).rows[0].f;
await db.query(`select mem_commit('tx-unlk001',${f})`);
ok("accounts back on personal; tenant retained as unlinked", J((await db.query(`select couple_id from user_accounts where id in('a','b') order by id`)).rows)==='[{"couple_id":"pa"},{"couple_id":"pb"}]' && (await db.query(`select link_status from couple_tenants`)).rows[0].link_status==="unlinked");
f=(await db.query(`select fence from membership_ops where tx_id='tx-unlk001'`)).rows[0].fence;
f=(await db.query(`select mem_advance('tx-unlk001',${f},'db_committed','fs_active') f`)).rows[0].f; await db.query(`select mem_advance('tx-unlk001',${f},'fs_active','done')`);
// relink same pair reuses same joint id
op=(await db.query(`select mem_reserve('tx-link004','link','a','b',null,'ignored') r`)).rows[0].r;
ok("same pair relink reuses the same joint space", op.tenant_id===joint);
// abort path releases locks
await db.query(`select mem_advance('tx-link004',1,'reserved','aborting')`); await db.query(`select mem_advance('tx-link004',2,'aborting','aborted')`);
ok("abort releases locks",(await db.query(`select count(*)::int c from membership_op_locks`)).rows[0].c===0);
// RLS function
await db.exec(`create table membership_op_locks_check as select 1`);
await db.exec(`set test.jwt = '{"app_metadata":{"pid":"u:a.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","couple_id":"STALE"}}'`);
ok("requesting_couple_id ignores stale claim", (await db.query(`select requesting_couple_id_v2() c`)).rows[0].c==="pa");
await db.exec(`insert into membership_ops(tx_id,kind,account_ids,from_spaces,to_spaces,tenant_id,pair_key) values('tx-lock0001','link','{a,b}','{}','{}','x','a|b'); insert into membership_op_locks values('a','tx-lock0001')`);
ok("no space while an op is open", (await db.query(`select requesting_couple_id_v2() c`)).rows[0].c==="");
await db.exec(`set test.jwt = '{"app_metadata":{"pid":"adm:root","couple_id":"adminspace"}}'`);
await db.exec(`set test.jwt = '{"app_metadata":{"couple_id":"STALE"}}'`);
ok("missing pid gets no space despite a stale claim", (await db.query(`select requesting_couple_id_v2() c`)).rows[0].c==="");
await db.exec(`set test.jwt = '{"app_metadata":{"pid":"u:a.${"b".repeat(32)}","couple_id":"STALE"}}'`);
ok("wrong nonce gets no space", (await db.query(`select requesting_couple_id_v2() c`)).rows[0].c==="");
await db.exec(`set test.jwt = '{"app_metadata":{"pid":"adm:root.${"c".repeat(32)}","couple_id":"adminspace"}}'`);
ok("non-u pid keeps claim", (await db.query(`select requesting_couple_id_v2() c`)).rows[0].c==="adminspace");
// personal id first-set validation
await db.exec(`alter table user_accounts disable trigger trg_init_personal_space; insert into user_accounts values('d','pd',now(),'${"d".repeat(32)}'),('e','jx',now(),'${"e".repeat(32)}'); insert into couple_tenants values('pd','solo d','d',''),('jx','joint','d','e')`);
await rej("first set: space used by another account refused","update user_accounts set personal_couple_id='pa' where id='d'",/another account/);
await rej("first set: a joint space refused","update user_accounts set personal_couple_id='jx' where id='d'",/another account|joint/);
await rej("first set: couple_default refused","update user_accounts set personal_couple_id='couple_default' where id='d'",/invalid/);
await db.query(`update user_accounts set personal_couple_id='pd' where id='d'`);
ok("first set: an existing solo tenant record is accepted", true);
await db.exec(`alter table user_accounts enable trigger trg_init_personal_space`);
await db.exec(`insert into user_accounts(id,couple_id,username) values('user_777','pa','newbie')`); // caller tries to create the account inside a's space
{ const r=(await db.query(`select couple_id, personal_couple_id from user_accounts where id='user_777'`)).rows[0];
  ok("new account gets its OWN generated personal space, supplied joint/other id ignored", r.couple_id==='couple_777' && r.personal_couple_id==='couple_777');
  ok("solo tenant row created for the new account", (await db.query(`select count(*)::int c from couple_tenants where couple_id='couple_777' and partner1='newbie' and coalesce(partner2,'')=''`)).rows[0].c===1); }
ok("new tenant plan is the account's plan or free, never implicit pro", (await db.query(`select plan from couple_tenants where couple_id='couple_777'`)).rows[0].plan==='free');
await db.exec(`insert into couple_tenants(couple_id,couple_name,partner1,partner2) values('couple_888','x','someoneelse','')`);
await rej("existing tenant of another owner is not adopted","insert into user_accounts(id,couple_id,username) values('user_888','x','newbie2')",/another tenant/);
await rej("invalid account id refused","insert into user_accounts(id,couple_id,username) values('user_a b','x','n3')",/invalid account id/);
await rej("case-insensitive duplicate username refused by the DB index","insert into user_accounts(id,couple_id,username) values('user_999','x','NEWBIE')",/user_accounts_username_lower_key/);
console.log(pass,"passed",fail,"failed");
