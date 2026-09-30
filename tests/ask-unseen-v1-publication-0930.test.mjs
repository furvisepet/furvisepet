import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as C from './helpers/calculation-public-fixture.mjs';
const cases=[];
const add=(category,name,expected,execute)=>cases.push({category,name,expected,execute});
for(const [op,texts,unit]of [
 ['difference',['13.375 kg','16.625 kg'],'kg'],
 ['mean',['9.25 kg','12.75 kg'],'kg'],
 ['percent_change',['16 kg','20 kg'],'%'],
 ['ratio',['0 kg','11 kg'],'scalar'],
])add('calculations','public publication '+op,{outcome:'limited',sources:[],effects:[]},async expected=>{
 const ticket=C.rawTicket();ticket.selection.union=[C.clause('asc',2)];
 const roles=op==='difference'?['reference','target']:op==='mean'?['member','member']:['reference','target'];
 const calculation=C.calculation(op,texts.map((_,i)=>({...C.slot(0,i),role:roles[i]})),unit);
 const f=await C.fixture({sourceRows:texts.map((v,i)=>C.row('fresh-public-'+i,v,i+13)),calculations:[calculation],ticket});
 assert.equal(f.response.calculationLabs,undefined);
 assert.match(JSON.stringify(f.response.answer),/cannot perform this type of calculation yet/i);
 assert.deepEqual(f.response.relevantContextIds,expected.sources);
 const final=await C.finish(f);assert.equal(final.assessment.outcome,expected.outcome);assert.equal(f.calls(),0);
});
for(const state of ['pending','succeeded','cancelled'])
 add('writes_idempotency','public confirmation blocks '+state,{http:404,effects:0},async expected=>{
 const {fixture,id}=await import('./helpers/ask-route-ordering.mjs');
 const f=fixture();f.rows.dog_profiles[0].name='Kestrel';
 f.rows.ask_action_capabilities.push({id:id(71),user_id:id(1),assistant_message_id:id(61),status:state});
 const before=structuredClone(f.rows.pet_care_entries);
 assert.equal((await f.confirm()).status,expected.http);assert.deepEqual(f.rows.pet_care_entries,before);
 assert.equal(f.rows.ask_action_capabilities[0].status,state);assert.equal(f.state.planner,0);
 assert.equal(f.state.events.filter(x=>x==='heart:execute').length,expected.effects);
});
for(const body of ['Kestrel ate 43 g of salmon.','Kestrel walked for 19 minutes.','Kestrel weighed 12.625 kg.'])
 add('companion_obligations','public mixed request: '+body,{http:200,capabilities:0,sourceRows:2},async expected=>{
 const {fixture,proposal}=await import('./helpers/ask-route-ordering.mjs');
 const question='Save '+body+' Then show the last two recorded weights.';
 const p=proposal(question);p.appendJob={operation:'append',petName:'Kestrel',bodyQuote:body,companionQuote:'show the last two recorded weights.'};
 const f=fixture({proposal:p,creditLedger:true});f.rows.dog_profiles[0].name='Kestrel';
 f.rows.pet_care_entries[0].note='Kestrel weighed 11.875 kg.';f.rows.pet_care_entries[1].note='Kestrel weighed 12.125 kg.';
 const before=structuredClone(f.rows.pet_care_entries);
 const response=await f.send(question);assert.equal(response.status,expected.http,JSON.stringify(f.state.errors.map(x=>({stage:x.stage,error:String(x.error),stack:x.error?.stack}))));
 const result=await response.json();
 assert.match(JSON.stringify(result),/cannot change records yet/);
 assert.deepEqual(f.rows.pet_care_entries,before);assert.equal(f.rows.ask_action_capabilities.length,expected.capabilities);
 assert.equal(f.state.events.includes('heart:execute'),false);
 assert.equal(f.state.events.includes('lungs:lineage'),false);
 assert.equal(f.state.credit.status,'released');
 assert.equal(f.state.publications.length,1);
 assert.equal(f.state.publications[0].authorizedPetIds.length,0);
 assert.equal(f.state.publications[0].suggestion,null);
 assert.equal(f.state.planner,1); // one stubbed interpretation response, no real provider.
});
const manifest=cases.map(({category,name,expected},i)=>({id:'UV1-PUB-'+String(i+1).padStart(2,'0'),category,name,expected}));
if(process.env.FURVISE_CAMPAIGN_MANIFEST_ONLY)fs.writeFileSync(process.env.FURVISE_CAMPAIGN_MANIFEST_ONLY,JSON.stringify({version:1,cases:manifest,providerCalls:0},null,2),{flag:'wx'});
else test('fresh public V1 publication campaign stops on first defect',async()=>{
 const receipt={completed:[],firstFailure:null,total:cases.length,providerCalls:0};
 try{for(const [i,c]of cases.entries()){try{await c.execute(c.expected);receipt.completed.push(manifest[i]);console.log('CAMPAIGN_PASS '+manifest[i].id);}
 catch(e){receipt.firstFailure={...manifest[i],error:String(e),stack:e.stack};throw e;}}}
 finally{if(process.env.FURVISE_CAMPAIGN_RESULT)fs.writeFileSync(process.env.FURVISE_CAMPAIGN_RESULT,JSON.stringify(receipt,null,2),{flag:'wx'});}
});
