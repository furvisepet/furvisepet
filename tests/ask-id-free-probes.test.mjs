
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
const {askRequestSchema,validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {groundReadProbes}=await import('../app/lib/intelligence/read-probes.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {bindReadNeeds}=await import('../app/lib/furvise-brain/read-needs.ts');
const pets=['Juniper','Tamarack','Willow'].map((name,i)=>({id:'pet-'+i,name,user_id:'owner',species:'dog'}));
const q='Juniper medication change; Tamarack food reaction';
const context=(question=q,turns=[])=>({owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:question,
 currentTurn:{id:'current-user',role:'user',text:question},conversationTurns:turns,timeZone:'UTC'});
const probe=(quote,pet,term)=>({quote,sourceTurnId:null,petNames:[pet],from:null,to:null,target:null,termGroups:[[term]],ordering:'desc'});
const probes=()=>[probe('Juniper medication change','Juniper','medication'),probe('Tamarack food reaction','Tamarack','food')];
const ticket=(ps=probes())=>({subjectScope:'named',operation:'read',temporal:{from:null,to:null,anchor:null,calendar:null},
 predicates:[],outputs:{strategy:null,completeness:'sufficient',ordering:'desc',limit:null},searchHints:null,episode:null,selection:null,probes:ps});
const proposal=(read=ticket(),ctx=context())=>({version:'ask-request.v2',mode:'read',readTicket:read,question:ctx.currentMessage,
 requirements:[],referenceTurnIds:[],evidenceNeeds:[],evidenceBasis:'saved_history',scope:'named',petNames:pets.slice(0,2).map(p=>p.name),
 operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[]});
async function run(p,ctx=context(),reject=false){
 let calls=0;const promise=interpretAskQuestion({context:ctx,model:'fixture',client:{responses:{create:async request=>{
 calls++;const branches=request.text.format.schema.properties.readTicket.anyOf.filter(b=>b.properties);
 for(const b of branches){assert.equal(Object.hasOwn(b.properties,'needs'),false);
 assert.equal(b.properties.probes.items.additionalProperties,false);
 for(const id of ['id','needId','sourceSpanId','petIds'])assert.equal(Object.hasOwn(b.properties.probes.items.properties,id),false);}
 return {output_text:JSON.stringify(p)};}}}});
 if(reject){await assert.rejects(promise);assert.equal(calls,1);return;}
 const r=await promise;assert.equal(calls,1);return r;
}
test('two ID-free probes become grounded needs and use existing Lungs',async()=>{
 const p=proposal();const before=structuredClone(p);const r=await run(p);assert.deepEqual(p,before);
 const needs=r.request.readTicket.needs;assert.deepEqual(needs.map(n=>n.id),['need:0','need:1']);
 assert.deepEqual(needs.map(n=>n.petIds),[['pet-0'],['pet-1']]);
 assert.deepEqual(needs.map(n=>n.sourceSpanId),['current-user:0:25','current-user:27:49']);
 assert.equal(Object.hasOwn(r.request.readTicket,'probes'),false);
 assert.deepEqual(r.request.evidenceNeeds.map(n=>n.id),['need:0','need:1']);
 const calls=[];const rows=needs.map((n,i)=>({id:'event-'+i,user_id:'owner',pet_profile_id:n.petIds[0],
 note:i?'Food reaction':'Medication change',title:null,occurred_at:'2025-03-01T00:00:00Z',
 created_at:'2025-03-01T00:00:00Z',updated_at:'2025-03-01T00:00:00Z',deleted_at:null}));
 const result=await retrieveReadTicket(r.request.readTicket,{userId:'owner',ownedPetIds:['pet-0','pet-1'],
 from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'},{
 page:async()=>assert.fail('No ordinary history fallback'),effective:async records=>({records,reliable:true}),
 needPage:async input=>{calls.push(input);return rows.filter(row=>row.pet_profile_id===input.petId);}});
 assert.deepEqual(result.records.map(r=>r.id).sort(),['event-0','event-1']);
 assert.deepEqual(calls.map(c=>c.petId),['pet-0','pet-1']);
 assert.deepEqual(result.coverage.needs.map(n=>n.needId),['need:0','need:1']);
});
test('provider schema closes identity fields and dynamically restricts source turn references',()=>{
 const ctx=context(q,[{id:'u-old',role:'user',text:q},{id:'assistant',role:'furvise',text:q}]);
 for(const b of askRequestSchema({},ctx).properties.readTicket.anyOf.filter(b=>b.properties)){
 assert.equal(b.properties.probes.items.additionalProperties,false);
 assert.deepEqual(b.properties.probes.items.properties.sourceTurnId.enum,[null,'u-old']);
 assert.equal(b.required.includes('needs'),false);assert.ok(b.required.includes('probes'));
 }
});
for(const field of ['needId','id','sourceSpanId','petIds'])test('provider identity injection rejected: '+field,async()=>{
 const ps=probes();ps[0][field]='invented';await run(proposal(ticket(ps)),context(),true);
});
test('forged quote rejects the batch with no returned grounded needs',async()=>{
 const ps=probes();ps[1].quote='invented source';assert.throws(()=>groundReadProbes(ps,context(),[],pets),e=>e.cause.rule==='ungrounded_evidence_need');
 await run(proposal(ticket(ps)),context(),true);
});
test('foreign, unreferenced, and assistant source turns reject',async()=>{
 for(const sourceTurnId of ['foreign','prior-user','assistant']){
 const ctx=context(q,[{id:'prior-user',role:'user',text:q},{id:'assistant',role:'furvise',text:q}]);
 const ps=probes();ps[0].sourceTurnId=sourceTurnId;const p=proposal(ticket(ps),ctx);
 if(sourceTurnId==='assistant')p.referenceTurnIds=['assistant'];
 await run(p,ctx,true);
 }
});
test('a referenced USER span binds to its original turn',async()=>{
 const ctx=context('Please answer both requests.',[{id:'prior-user',role:'user',text:q}]);
 const ps=probes().map(p=>({...p,sourceTurnId:'prior-user'}));const p=proposal(ticket(ps),ctx);p.referenceTurnIds=['prior-user'];
 const r=await run(p,ctx);assert.ok(r.request.readTicket.needs.every(n=>n.sourceSpanId.startsWith('prior-user:')));
});
test('unauthorized or out-of-ticket pet invalidates the whole proposal',async()=>{
 for(const pet of ['SomeoneElse','Willow']){const ps=probes();ps[1].petNames=[pet];await run(proposal(ticket(ps)),context(),true);}
});
test('homogeneous grouped work and synonyms retain one selection across generic predicates',async()=>{
 for(const terms of [['weight','weigh','weighed'],['food','eating'],['medication','medicine']]){
 const ctx=context('Newest matching record for each of the three');
 const read={...ticket([]),predicates:[{kind:'text_any',terms}],
 selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]},
 outputs:{completeness:'sufficient',ordering:'desc',limit:null}};
 const p=proposal(read,ctx);p.petNames=pets.map(p=>p.name);const r=await run(p,ctx);
 assert.deepEqual(r.request.readTicket.needs,[]);assert.deepEqual(r.petIds,pets.map(p=>p.id));
 assert.deepEqual(r.request.readTicket.selection,read.selection);
 }
});
test('probe plus selection or parallel evidenceNeeds/needs representations reject',async()=>{
 const p=proposal();await run({...p,evidenceNeeds:[{quote:q,sourceTurnId:null,petNames:[],terms:[],order:'context'}]},context(),true);
 await run({...p,readTicket:{...p.readTicket,needs:[]}},context(),true);
 await run({...p,readTicket:{...p.readTicket,selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}}},context(),true);
});
test('legacy model-owned identity is forbidden even if its old binding would validate',async()=>{
 const p=proposal();const {probes:ps,...read}=p.readTicket;
 p.readTicket={...read,needs:ps.map((probe,i)=>({needId:'need:'+i,from:null,to:null,target:null,termGroups:probe.termGroups,ordering:probe.ordering}))};
 p.evidenceNeeds=ps.map(probe=>({quote:probe.quote,sourceTurnId:null,petNames:probe.petNames,terms:[],order:'latest'}));
 assert.equal(validateAskRequest(p,context()).request.readTicket.needs.length,2); // retained internal compatibility
 await run(p,context(),true);
 assert.throws(()=>bindReadNeeds([{...p.readTicket.needs[0],needId:'need:invented'}],[],['pet-0']),
 e=>e.cause.rule==='grounded_binding_required');
});
test('typed temporal and lexical errors still use the strict need binder',async()=>{
 for(const patch of [{from:'2025-02-30T00:00:00Z'},{ordering:'newest'},{termGroups:[['kg']]},{target:'2025-03'}]){
 const ps=probes();ps[0]={...ps[0],...patch};await run(proposal(ticket(ps)),context(),true);
 }
});
test('duplicate grounding rejects instead of silently remapping another probe',async()=>{
 const ps=probes();ps[1]={...ps[0]};await run(proposal(ticket(ps)),context(),true);
});

test('JSON Schema accepts ID-free probes and rejects legacy identity and mixed selection',async()=>{
 const {default:Ajv}=await import('ajv');
 const validate=new Ajv({allErrors:true}).compile(askRequestSchema({},context()).properties.readTicket);
 assert.equal(validate(ticket()),true,JSON.stringify(validate.errors));
 const withId=ticket();withId.probes[0].needId='need:invented';assert.equal(validate(withId),false);
 const old=ticket();old.needs=[];assert.equal(validate(old),false);
 const grouped={...ticket([]),predicates:[{kind:'text_any',terms:['weight']}],
 outputs:{completeness:'sufficient',ordering:'desc',limit:null},
 selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
 assert.equal(validate(grouped),true,JSON.stringify(validate.errors));
 grouped.probes=probes();assert.equal(validate(grouped),false);
});
test('distinct dated probes preserve their own typed window and term groups after grounding',async()=>{
 const first='Juniper medication during March 2025',second='Tamarack food on April 2 2024';
 const ctx=context(first+'; '+second);
 const ps=[{...probe(first,'Juniper','medication'),from:'2025-03-01T00:00:00Z',to:'2025-04-01T00:00:00Z',target:'2025-03',
 termGroups:[['medication','medicine'],['changed']]},
 {...probe(second,'Tamarack','food'),from:'2024-04-02T00:00:00Z',to:'2024-04-03T00:00:00Z',target:'2024-04-02',ordering:'asc'}];
 const r=await run(proposal(ticket(ps),ctx),ctx);
 r.request.readTicket.needs.forEach((need,i)=>{
 assert.equal(need.from,ps[i].from);assert.equal(need.to,ps[i].to);assert.equal(need.target,ps[i].target);
 assert.deepEqual(need.termGroups,ps[i].termGroups);assert.equal(need.ordering,ps[i].ordering);
 assert.deepEqual(r.request.evidenceNeeds[i].window,{from:ps[i].from,to:ps[i].to});
 });
});
