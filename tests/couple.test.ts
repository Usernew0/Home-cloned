import test from 'node:test';
import assert from 'node:assert/strict';
import {linkCoupleWith, unlinkCoupleWith} from '../server/couple.ts';

type Row=Record<string,any>;
function makeDb(seed:Record<string,Row[]>, opts:{failOn?:(op:string,table:string,n:number)=>boolean, missingTables?:string[]}={}){
 const t:Record<string,Row[]>=JSON.parse(JSON.stringify(seed)); let n=0;
 const log:string[]=[];
 const from=(table:string)=>{
  const state:any={op:'select',filters:[] as ((r:Row)=>boolean)[],patch:null,rowIn:null,limit:undefined};
  const q:any={
   select(){state.op=state.op==='select'?'select':state.op;return q;},
   update(p:Row){state.op='update';state.patch=p;return q;},
   upsert(r:Row){state.op='upsert';state.rowIn=r;return q;},
   delete(){state.op='delete';return q;},
   eq(c:string,v:any){state.filters.push(r=>r[c]===v);return q;},
   in(c:string,vs:any[]){state.filters.push(r=>vs.includes(r[c]));return q;},
   limit(l:number){state.limit=l;return q;},
   then(res:any,rej:any){ return Promise.resolve(run()).then(res,rej); },
  };
  function run(){
   n++; log.push(`${state.op}:${table}`);
   if(opts.missingTables?.includes(table)) return {data:null,error:{code:'PGRST205',message:'missing table'}};
   if(opts.failOn?.(state.op,table,n)) return {data:null,error:{message:`injected ${state.op} ${table}`}};
   const rows=t[table]||(t[table]=[]);
   const hit=rows.filter(r=>state.filters.every((f:any)=>f(r)));
   if(state.op==='select') return {data:JSON.parse(JSON.stringify(state.limit?hit.slice(0,state.limit):hit)),error:null};
   if(state.op==='update'){hit.forEach(r=>Object.assign(r,state.patch));return {data:null,error:null};}
   if(state.op==='delete'){t[table]=rows.filter(r=>!hit.includes(r));return {data:null,error:null};}
   if(state.op==='upsert'){const k=table==='couple_tenants'?'couple_id':'id';const i=rows.findIndex(r=>r[k]===state.rowIn[k]);if(i>=0)rows[i]={...state.rowIn};else rows.push({...state.rowIn});return {data:null,error:null};}
  }
  return q;
 };
 return {db:{from},t,log};
}
const seed=()=>({
 user_accounts:[{id:'u1',username:'Ebrahimtest',couple_id:'couple_solo_e'},{id:'u2',username:'Qq',couple_id:'couple_solo_q'},{id:'u3',username:'Other',couple_id:'couple_default'}],
 couple_tenants:[{couple_id:'couple_solo_e',couple_name:"e's Couple",partner1:'Ebrahimtest',partner2:''},{couple_id:'couple_solo_q',couple_name:"q's Couple",partner1:'Qq',partner2:''}],
 milestones:[{id:'m1',couple_id:'couple_solo_e'},{id:'m2',couple_id:'couple_solo_q'},{id:'m3',couple_id:'couple_default'},{id:'m4',couple_id:'couple_other'}],
 letters:[{id:'l1',couple_id:'couple_default',sender:'Qq'},{id:'l2',couple_id:'couple_default',sender:'Other'}],
 memories:[],date_plans:[],couple_questions:[],activity_logs:[],celebration_cards:[],chat_messages:[],
});
const accts=(t:any)=>Object.fromEntries(t.user_accounts.map((a:any)=>[a.username,a.couple_id]));

test('link: moves exactly the two accounts rows by id, leaves default/other rows and old solo records, verifies',async()=>{
 const {db,t}=makeDb(seed());
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'qq'});
 assert.equal(r.status,200); assert.equal(r.body.success,true);
 const id=r.body.coupleId; const a=accts(t);
 assert.equal(a.Ebrahimtest,id); assert.equal(a.Qq,id); assert.equal(a.Other,'couple_default');
 assert.deepEqual(t.milestones.map((m:any)=>m.couple_id),[id,id,'couple_default','couple_other']);
 assert.deepEqual(t.letters.map((l:any)=>l.couple_id),[id,'couple_default']);   // letter by sender only
 assert.equal(t.couple_tenants.length,3);                                        // old solo records untouched
 assert.deepEqual(r.body.moved,{milestones:2,letters:1});
});
test('link: failure while moving rows undoes accounts, tenant and already moved rows, and says so',async()=>{
 const s=seed(); const {db,t}=makeDb(s,{failOn:(op,table)=>op==='update'&&table==='letters'});
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 assert.equal(r.status,500); assert.equal(r.body.success,false); assert.equal(r.body.rolledBack,true);
 assert.match(r.body.error,/All changes were undone/);
 assert.deepEqual(t,JSON.parse(JSON.stringify(s)));
});
test('link: failure on account update rolls back the tenant record',async()=>{
 const s=seed(); let c=0; const {db,t}=makeDb(s,{failOn:(op,table)=>op==='update'&&table==='user_accounts'&&++c===2});
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 assert.equal(r.body.rolledBack,true); assert.deepEqual(t,JSON.parse(JSON.stringify(s)));
});
test('link: a failing rollback is reported, never claimed as undone',async()=>{
 const s=seed(); let moves=0;
 const {db}=makeDb(s,{failOn:(op,table)=>{ if(op==='update'&&table==='milestones'){moves++; return moves>=2;} return false; }});
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 assert.equal(r.status,500); assert.equal(r.body.rolledBack,false); assert.match(r.body.error,/could NOT be undone/); assert.ok(r.body.rollbackErrors.length>0);
});
test('link: a read error on a data table aborts before any write',async()=>{
 const s=seed(); const {db,t,log}=makeDb(s,{failOn:(op,table)=>op==='select'&&table==='memories'});
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 assert.equal(r.status,500); assert.deepEqual(t,JSON.parse(JSON.stringify(s)));
 assert.ok(!log.some(l=>l.startsWith('update')||l.startsWith('upsert')));
});
test('link: a missing optional table is skipped and reported, not fatal',async()=>{
 const {db}=makeDb(seed(),{missingTables:['chat_messages']});
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 assert.equal(r.status,200); assert.deepEqual(r.body.skippedTables,['chat_messages']);
});
test('link: unknown account, same account and already-linked pair are handled without writes',async()=>{
 const {db,t}=makeDb(seed());
 assert.equal((await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Nobody'})).status,400);
 assert.equal((await linkCoupleWith(db,{partner1:'Qq',partner2:'qq'})).status,400);
 const first=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 const again=await linkCoupleWith(db,{partner1:'Qq',partner2:'Ebrahimtest'});
 assert.equal(again.body.alreadyLinked,true); assert.equal(again.body.coupleId,first.body.coupleId);
 assert.equal(t.couple_tenants.length,3);
});
test('restore: reconnects both accounts to a previous space id so rows stored under it become reachable',async()=>{
 const s:any=seed(); s.user_accounts[0].couple_id='couple_e_new'; s.user_accounts[1].couple_id='couple_q_new';
 s.milestones.push({id:'m9',couple_id:'couple_old_joint'}); s.memories.push({id:'x1',couple_id:'couple_old_joint'});
 const {db,t}=makeDb(s);
 const r=await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq',restoreCoupleId:'couple_old_joint'});
 assert.equal(r.status,200); assert.equal(r.body.coupleId,'couple_old_joint');
 assert.deepEqual(accts(t),{Ebrahimtest:'couple_old_joint',Qq:'couple_old_joint',Other:'couple_default'});
 assert.equal(t.milestones.find((m:any)=>m.id==='m9').couple_id,'couple_old_joint');
 assert.equal(t.memories[0].couple_id,'couple_old_joint');
});
test('restore: refuses an id owned by another couple or another account, and bad ids',async()=>{
 const s:any=seed(); s.couple_tenants.push({couple_id:'couple_x',couple_name:'x',partner1:'A',partner2:'B'}); s.user_accounts.push({id:'u9',username:'Zed',couple_id:'couple_zed'});
 const {db,t}=makeDb(s);
 for(const id of ['couple_x','couple_zed','couple_default','bad id;']) assert.equal((await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq',restoreCoupleId:id})).status,400);
 assert.deepEqual(accts(t).Ebrahimtest,'couple_solo_e');
});
test('unlink: refuses with a data decision while the space holds rows; nothing changes',async()=>{
 const {db,t}=makeDb(seed()); await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 const before=JSON.parse(JSON.stringify(t)); const id=accts(t).Qq;
 const r=await unlinkCoupleWith(db,{coupleId:id});
 assert.equal(r.status,409); assert.equal(r.body.needsDataDecision,true); assert.deepEqual(t,before);
});
test('unlink: with explicit leave-in-place only accounts of that exact space move; failure rolls back',async()=>{
 const {db,t}=makeDb(seed()); await linkCoupleWith(db,{partner1:'Ebrahimtest',partner2:'Qq'});
 const id=accts(t).Qq; const before=JSON.parse(JSON.stringify(t));
 const bad=makeDb(before,{failOn:(op,table)=>op==='delete'&&table==='couple_tenants'});
 const r0=await unlinkCoupleWith(bad.db,{coupleId:id,dataPolicy:'leave-in-place'});
 assert.equal(r0.body.rolledBack,true); assert.deepEqual(bad.t,before);
 const r=await unlinkCoupleWith(db,{coupleId:id,dataPolicy:'leave-in-place'});
 assert.equal(r.status,200); const a=accts(t);
 assert.notEqual(a.Ebrahimtest,id); assert.notEqual(a.Qq,id); assert.equal(a.Other,'couple_default');
 assert.ok(!t.couple_tenants.some((x:any)=>x.couple_id===id));
 assert.equal(t.couple_tenants.length,2);                                       // the old solo records are not touched
});
test('unlink: a space no account points at cannot be unlinked or deleted',async()=>{
 const {db,t}=makeDb(seed()); const before=JSON.parse(JSON.stringify(t));
 const r=await unlinkCoupleWith(db,{coupleId:'couple_unknown'});
 assert.equal(r.status,400); assert.deepEqual(t,before);
});
