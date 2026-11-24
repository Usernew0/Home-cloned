import test from 'node:test';
import assert from 'node:assert/strict';
import {findTenantForUser, partnerNameFor, isTenantInUse, isSpaceUnlinked, unlinkTargets} from '../src/lib/coupleLink.ts';

const tenants=[
 {coupleId:'c_solo_e',partner1:'Ebrahimtest',partner2:''},
 {coupleId:'c_solo_q',partner1:'Qq',partner2:''},
 {coupleId:'c_joint',partner1:'Qq',partner2:'Ebrahimtest'},
];
const users=[{id:'1',username:'Ebrahimtest',coupleId:'c_joint'},{id:'2',username:'Qq',coupleId:'c_joint'}];

test('regression: linked users show each other even when stale solo tenants list them first',()=>{
 assert.equal(findTenantForUser(users[0],tenants)!.coupleId,'c_joint');
 assert.equal(partnerNameFor(users[0],users,tenants),'Qq');
 assert.equal(partnerNameFor(users[1],users,tenants),'Ebrahimtest');
});
test('a genuinely unlinked user stays unlinked',()=>{
 const u={id:'3',username:'Solo',coupleId:'c_x'};
 assert.equal(partnerNameFor(u,[u],[{coupleId:'c_x',partner1:'Solo',partner2:''}]),undefined);
});
test('name fallback prefers a two-person tenant and falls back to same-couple user',()=>{
 const u={id:'1',username:'Ebrahimtest'};
 assert.equal(findTenantForUser(u,tenants)!.coupleId,'c_joint');
 assert.equal(partnerNameFor({id:'1',username:'A',coupleId:'z'},[{id:'1',username:'A',coupleId:'z'},{id:'2',username:'B',coupleId:'z'}],[]),'B');
});

test('name fallback never crosses into a tenant with a different explicit couple id',()=>{
 const u={id:'1',username:'Ebrahimtest',coupleId:'c_other'};
 assert.equal(findTenantForUser(u,tenants),undefined);
 assert.equal(partnerNameFor(u,[u],tenants),undefined);
 assert.equal(findTenantForUser({id:'9',username:'Ebrahimtest'},tenants)!.coupleId,'c_joint');
});

test('old solo tenants are flagged unused while the joint one is in use',()=>{
 assert.equal(isTenantInUse(tenants[0],users),false);
 assert.equal(isTenantInUse(tenants[1],users),false);
 assert.equal(isTenantInUse(tenants[2],users),true);
});

test('unlinked label needs a server-loaded, non-empty account list',()=>{
 assert.equal(isSpaceUnlinked(tenants[0],users,true),true);
 assert.equal(isSpaceUnlinked(tenants[2],users,true),false);
 assert.equal(isSpaceUnlinked(tenants[0],users,false),false);   // still loading / cache only
 assert.equal(isSpaceUnlinked(tenants[0],[],true),false);       // empty or failed load
});

test('regression: Unlink never touches an account by name and never acts on a space with no linked accounts',()=>{
 const us=[{id:'1',username:'Ebrahimtest',coupleId:'c_joint'},{id:'2',username:'Qq',coupleId:'c_joint'}];
 const solo=unlinkTargets(tenants[0],us,true);   // leftover solo row that lists Ebrahimtest as partner1
 assert.equal(solo.canUnlink,false); assert.equal(solo.users.length,0);
 const joint=unlinkTargets(tenants[2],us,true);
 assert.equal(joint.canUnlink,true); assert.deepEqual(joint.users.map(u=>u.username),['Ebrahimtest','Qq']);
 assert.equal(unlinkTargets({partner1:'x'} as any,us,true).canUnlink,false);
});

test('regression: Unlink is refused while accounts are cache-only (stale pre-relink list)',()=>{
 const stale=[{id:'1',username:'Ebrahimtest',coupleId:'c_solo_e'}];
 const r=unlinkTargets(tenants[0],stale,false);
 assert.equal(r.canUnlink,false); assert.equal(r.users.length,0);
});
