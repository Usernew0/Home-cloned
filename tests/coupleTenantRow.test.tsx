import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CoupleTenantRow} from '../src/components/CoupleTenantRow.tsx';
import {isSpaceUnlinked} from '../src/lib/coupleLink.ts';

const mk=(t:any,loaded:boolean,users:any[])=>renderToStaticMarkup(React.createElement(CoupleTenantRow,{tenant:{plan:'pro',created_at:'',isFromDatabase:true,...t} as any,unlinkedSpace:isSpaceUnlinked(t,users,loaded),isSyncing:false,subscriptionPlans:[{id:'pro',name:'Pro',price:'$1'} as any],getStatus:()=>({isExpired:false,isLifetime:true,statusText:'Lifetime',formattedEndDate:'x'}),onSetPlan:()=>{},onUnlink:()=>{},onSaveToDb:()=>{}}));
const users=[{id:'1',username:'E',coupleId:'j'}];
test('production row: label only when loaded and unlinked; Unlink always present; no dimming or deletion wording',()=>{
 const solo={coupleId:'s',coupleName:'solo',partner1:'E',partner2:''};
 const a=mk(solo,true,users); assert.match(a,/No accounts currently linked/); assert.match(a,/Unlink/); assert.match(a,/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Unlink/s); assert.doesNotMatch(a,/opacity-60|unused|old space/i);
 assert.doesNotMatch(mk(solo,false,users),/No accounts currently linked/);
 assert.doesNotMatch(mk(solo,true,[]),/No accounts currently linked/);
 const joint={coupleId:'j',coupleName:'joint',partner1:'E',partner2:'Q'};
 const b=mk(joint,true,users); assert.doesNotMatch(b,/No accounts currently linked/); assert.match(b,/Unlink/); assert.doesNotMatch(b,/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Unlink/s);
});
