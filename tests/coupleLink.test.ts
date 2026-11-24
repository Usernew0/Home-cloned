import test from 'node:test';
import assert from 'node:assert/strict';
import {findTenantForUser, partnerNameFor} from '../src/lib/coupleLink.ts';

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
