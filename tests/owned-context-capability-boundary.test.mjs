import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFurvisePlanningContext} from '../app/lib/intelligence/planning-context.ts';
import {assertOwnedPlanningBoundary,planningFixture,assertPlanningQueries,planningMutant,id,assertPublicWrapperParity,assertRouteCapabilityOrdering,assertPublicRouteDenial} from './helpers/owned-context-capability-boundary.mjs';
test('normal owned planning scopes every actual query and projects only paired citation identity',async()=>{await assertOwnedPlanningBoundary();});
test('no prior request performs exactly the three mandatory scoped reads',async()=>{
 const f=planningFixture(r=>{r.ask_conversation_messages=r.ask_conversation_messages.filter(x=>x.id===id(33));});
 const c=await buildFurvisePlanningContext(f.args);assertPlanningQueries(f.queries);assert.equal(f.queries.length,3);assert.deepEqual(c.pinnedUserSourceIds,[]);
});
for(const [name,edit]of [
 ['foreign conversation owner',r=>r.ask_conversations[0].user_id=id(2)],
 ['wrong conversation subject',r=>r.ask_conversations[0].pet_profile_id=id(12)],
 ['absent conversation',r=>r.ask_conversations=[]],
 ['absent owned subject',r=>r.dog_profiles=r.dog_profiles.filter(p=>p.id!==id(11))],
 ['absent current USER',r=>r.ask_conversation_messages=r.ask_conversation_messages.filter(x=>x.id!==id(33))],
 ['foreign current USER',r=>r.ask_conversation_messages.find(x=>x.id===id(33)).user_id=id(2)],
 ['changed current source',r=>r.ask_conversation_messages.find(x=>x.id===id(33)).user_text='changed'],
 ['assistant cannot be current USER',r=>r.ask_conversation_messages.find(x=>x.id===id(33)).role='furvise'],
 ])test('planning rejects '+name,async()=>{
 const f=planningFixture(edit);await assert.rejects(()=>buildFurvisePlanningContext(f.args),/not available|could not|couldn't/);
 assert.ok(f.queries.every(q=>['dog_profiles','ask_conversations','ask_conversation_messages'].includes(q.table)));
});
for(const [name,edit]of [
 ['absent citation',r=>r.ask_conversation_messages=r.ask_conversation_messages.filter(x=>x.id!==id(32))],
 ['assistant claim without explicit identity',r=>r.ask_conversation_messages.find(x=>x.id===id(32)).response_data={summary:'Juniper definitely has a condition.'}],
 ['duplicate response identity',r=>r.ask_conversation_messages.push({...r.ask_conversation_messages.find(x=>x.id===id(32)),id:id(90)})],
 ['citation before original USER',r=>r.ask_conversation_messages.find(x=>x.id===id(32)).sequence_number=1],
 ['foreign citation owner',r=>r.ask_conversation_messages.find(x=>x.id===id(32)).user_id=id(2)],
 ['wrong logical request',r=>r.ask_conversation_messages.find(x=>x.id===id(32)).request_id=id(98)],
 ])test('unpaired provenance is withheld: '+name,async()=>{
 const f=planningFixture(edit),c=await buildFurvisePlanningContext(f.args);
 assertPlanningQueries(f.queries);assert.ok(c.conversationTurns.every(x=>x.role==='user'));
 assert.ok(!JSON.stringify(c).includes('untrusted assistant claims'));
});
test('query scope mutation is caught by the independent actual-query audit',async()=>{
 const source=readFileSync(new URL('../app/lib/intelligence/planning-context.ts',import.meta.url),'utf8');
 const changed=source.replaceAll('.eq("user_id", userId)','').replaceAll('.eq("user_id",userId)','');
 assert.notEqual(changed,source);
 await assert.rejects(()=>assertOwnedPlanningBoundary(planningMutant(changed)),/owner-scoped|deep-equal|Expected|conversation/);
});
test('query sequence mutation is caught even when returned record identity happens to match',async()=>{
 const source=readFileSync(new URL('../app/lib/intelligence/planning-context.ts',import.meta.url),'utf8');
 const changed=source.replace('.lt("sequence_number",current.sequence_number!)','');
 assert.notEqual(changed,source);
 await assert.rejects(()=>assertOwnedPlanningBoundary(planningMutant(changed)));
});
test('typed public policy wrapper preserves denial and permitted read/conversation',()=>assertPublicWrapperParity());
test('actual route AST puts denial exits before all relevant mutation and lifecycle entrypoints',()=>assertRouteCapabilityOrdering());
test('removing the mutation denial breaks the ordering invariant',()=>{
 const source=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
 const changed=source.replace('if (!publicV1Capability.available && publicV1Capability.reason === "mutation")','if (false)');
 assert.notEqual(changed,source);assert.throws(()=>assertRouteCapabilityOrdering(changed));
});
test('valid full-wire append proposal reaches original Binder but public route publishes only denial and releases credit',async()=>{await assertPublicRouteDenial();});
test('unauthorized authentication never dispatches controlled provider or executor',async()=>{
 const {fixture}=await import('./helpers/ask-route-ordering.mjs');const f=fixture({denied:true,creditLedger:true});
 assert.equal((await f.send()).status,401);assert.equal(f.state.planner,0);assert.equal(f.rows.ask_action_capabilities.length,0);assert.equal(f.state.credit,null);
});
test('controlled provider failure creates no action authority or write',async()=>{
 const {fixture}=await import('./helpers/ask-route-ordering.mjs');const f=fixture({modelDown:true,creditLedger:true});
 assert.equal((await f.send()).status,503);assert.equal(f.state.planner,1);assert.equal(f.rows.ask_action_capabilities.length,0);assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.state.credit?.status,'released');
});
test('enabling forbidden engine proposal effects is detected by the same public route invariant',async()=>{
 await assert.rejects(()=>assertPublicRouteDenial({engineCapabilities:true}),e=>e.code==='ERR_ASSERTION'&&/cannot change records yet/.test(e.message));
});

test('preview flags and matching account cannot override a public mutation denial',async()=>{
 const keys=['VERCEL_ENV','FURVISE_PREVIEW_RECORDED_DIFFERENCE','FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID','FURVISE_PREVIEW_RECORDED_ANCHOR','FURVISE_PREVIEW_RECORDED_MEASUREMENT'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{VERCEL_ENV:'preview',FURVISE_PREVIEW_RECORDED_DIFFERENCE:'1',FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID:id(1),FURVISE_PREVIEW_RECORDED_ANCHOR:'1',FURVISE_PREVIEW_RECORDED_MEASUREMENT:'1'});
  assertPublicWrapperParity();
  const {id:routeId}=await import('./helpers/ask-staged-route-fixture.mjs');
  process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID=routeId(1);
  await assertPublicRouteDenial();
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});

test('unmodified extracted loader passes the same value and query assertions as the imported normal loader',async()=>{
 const source=readFileSync(new URL('../app/lib/intelligence/planning-context.ts',import.meta.url),'utf8');
 await assertOwnedPlanningBoundary(planningMutant(source));
});
