import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {saveCredentialSetting, safeCachedSettings} from '../src/lib/credentialSafety.ts';
import {storage} from '../src/utils.ts';
const cache = new Map<string,string>();
globalThis.localStorage = {getItem:(k:string)=>cache.get(k)??null,setItem:(k:string,v:string)=>cache.set(k,v),removeItem:(k:string)=>cache.delete(k)} as any;
const response = (data:any, status=200) => new Response(JSON.stringify(data),{status});

test('credential workflow: dedicated POST, confirmed redacted refresh, no legacy mirror/cache leak', async()=>{
 const calls:any[]=[]; let committed:any;
 const fake = async (url:any, options:any) => {
  calls.push({url,options});
  return options.method === 'POST' ? response({success:true}) : response({success:true,settings:[{id:'adminAccounts',admin_accounts:[{id:'a1',username:'owner',password:'should-be-removed',two_factor_secret:'secret',hasPassword:true}]}]});
 };
 await saveCredentialSetting({id:'adminAccounts',admin_accounts:[{id:'a1',username:'owner',password:'synthetic-new-password'}]}, {fetch:fake as any,token:'test-session',commit:rows=>{committed=rows;storage.setAdminSettings(rows)}});
 assert.deepEqual(calls.map(c=>c.url),['/api/admin-settings','/api/admin-settings']);
 assert.equal(calls[0].options.headers['x-server-session'],'test-session');
 assert.ok(calls[0].options.body.includes('synthetic-new-password'));
 assert.ok(!JSON.stringify(committed).includes('should-be-removed'));
 assert.ok(!JSON.stringify(committed).includes('two_factor_secret'));
 assert.ok(!cache.get('love_admin_settings')?.includes('password'));
});

test('credential workflow: denied write never mutates cache and reports failure', async()=>{
 let commits=0;let calls=0;
 await assert.rejects(saveCredentialSetting({id:'credentials',password:'new'}, {fetch:(async()=>{calls++;return response({success:false,error:'database write failed'},500)}) as any,token:'',commit:()=>{commits++}}),/database write failed/);
 assert.equal(commits,0);assert.equal(calls,1);
});

test('credential workflow: successful write but failed refresh is explicit, never caches input',async()=>{
 let calls=0;let commits=0;
 await assert.rejects(saveCredentialSetting({id:'credentials',password:'new'}, {fetch:(async()=>++calls===1?response({success:true}):response({success:false},503)) as any,token:'',commit:()=>{commits++}}),/were saved, but refresh failed/);
 assert.equal(commits,0);
});

test('legacy browser caches scrub account and nested admin secrets on read and write',()=>{
 cache.set('love_user_accounts',JSON.stringify([{id:'u1',username:'alice',password:'legacy',twoFactorSecret:'secret',twoFactorBackupCodes:['code'],coupleId:'c1'}]));
 const users=storage.getUserAccounts();assert.equal(users[0].username,'alice');assert.ok(!JSON.stringify(users).includes('legacy'));
 cache.set('love_admin_settings',JSON.stringify([{id:'adminAccounts',visibleTabs:{adminAccounts:[{id:'a',username:'owner',password:'legacy',twoFactorSecret:'secret'}]}},{id:'promoCodes',password:'noncredential-legacy-json'}]));
 const settings=storage.getAdminSettings();assert.ok(!JSON.stringify(settings[0]).includes('legacy'));assert.equal(settings[1].password,'noncredential-legacy-json');
 storage.setUserAccounts([{id:'u1',username:'alice',password:'raw'}] as any);assert.ok(!cache.get('love_user_accounts')?.includes('raw'));
 assert.equal(safeCachedSettings([{id:'theme',password:'unrelated-legacy-storage'}])[0].password,'unrelated-legacy-storage');
});

test('actual client wiring uses dedicated credential workflow, excludes legacy sync and mirrors',()=>{
 const service=fs.readFileSync('src/lib/supabaseService.ts','utf8');
 const save=service.slice(service.indexOf('export async function saveAdminSettingDoc'),service.indexOf('// 8. ACTIVITY LOGS'));
 assert.ok(save.indexOf('await saveCredentialSetting') < save.indexOf('storage.setAdminSettings(updatedList)'));
 assert.ok(service.includes('updatedList.map(redactCredentialRecord)'));
 const firebase=fs.readFileSync('src/lib/firebaseService.ts','utf8');
 const account=firebase.slice(firebase.indexOf('export function subscribeToFirestoreUserAccounts'),firebase.indexOf('// REAL-TIME FIRESTORE COUPLE TENANTS'));
 assert.ok(!account.includes('onSnapshot('));assert.ok(!account.includes('setDoc('));
 const sync=fs.readFileSync('src/lib/syncService.ts','utf8');assert.ok(sync.includes('account bulk sync is disabled'));
});
