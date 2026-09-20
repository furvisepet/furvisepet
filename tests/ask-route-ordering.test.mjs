import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,cedar,id,proposal} from './helpers/ask-route-ordering.mjs';
import {ownerNoteSourceSpans} from '../app/lib/intelligence/owner-note-request.ts';
test('Cedar: one Brain ticket, no write until click, Heart receipt before real Lungs last-two read',async()=>{
 const f=fixture();const res=await f.send();const body=await res.json();assert.equal(res.status,200,JSON.stringify(f.state.errors));
 assert.equal(f.state.planner,1);assert.equal(f.rows.pet_care_entries.length,2);assert.equal(body.dataChanged,false);assert.equal(body.persistenceMode,'confirmation_required');assert.equal(body.turn.finalStage,'COMPLETED');assert.equal(body.turn.mutationOutcome,'pending');
 const pending=body.response.pendingAppend;assert.equal(pending.job.body.text,'Cedar refused lunch.');assert.deepEqual(pending.readTicket.subjects.petIds,[id(11)]);
 assert.ok(!f.state.events.includes('read:pet_care_entries'));
 f.state.options.modelDown=true;
 const confirmation=await f.confirm();const result=await confirmation.json();assert.equal(confirmation.status,200);assert.equal(result.action.status,'succeeded');assert.equal(result.changed,true);assert.equal(result.continuation.response.turn.mutationOutcome,'applied');
 assert.equal(f.rows.pet_care_entries.length,3);assert.equal(f.rows.pet_care_entries[2].note,'Cedar refused lunch.');assert.ok(f.rows.ask_action_capabilities[0].receipt);
 assert.ok(result.continuation?.labs,JSON.stringify(result));assert.deepEqual(result.continuation.labs.records.map(r=>r.id),[id(52),id(51)]);
 assert.match(result.continuation.response.directAnswer,/9\.4 kg[\s\S]*9\.2 kg/);assert.equal(f.state.planner,1);
 assert.ok(f.state.events.indexOf('brain')<f.state.events.indexOf('heart:execute'));assert.ok(f.state.events.indexOf('heart:receipt')<f.state.events.indexOf('read:pet_care_entries'));
 const replay=await(await f.confirm()).json();assert.equal(replay.changed,false);assert.equal(f.rows.pet_care_entries.length,3);assert.equal(f.state.planner,1);
});
test('splitter emits exact offset spans only; no answer, scope, depth, or authority',()=>{
 const spans=ownerNoteSourceSpans(cedar,id(31));assert.deepEqual(spans.map(s=>[s.role,s.start,s.end]),[['note',9,29],['companion',30,59]]);for(const span of spans){assert.equal(cedar.slice(span.start,span.end),span.text);assert.ok(span.id);assert.equal(span.sourceMessageId,id(31));for(const key of ['answer','memoryDepth','history','execute','persist','operation'])assert.equal(span[key],undefined);}
});
for(const options of [{modelDown:true},{conversationFailure:true},{denied:true},{petId:id(99)}])test(`proposal failure never writes: ${JSON.stringify(options)}`,async()=>{
 const f=fixture(options);assert.equal((await f.send()).ok,false);assert.equal(f.rows.pet_care_entries.length,2);assert.ok(!f.state.events.includes('heart:execute'));
});
for(const options of [{noReceipt:true},{dbFailure:true}])test(`unverified Heart write cannot retrieve or publish weights: ${JSON.stringify(options)}`,async()=>{
 const f=fixture(options);assert.equal((await f.send()).status,200);const res=await f.confirm();assert.equal(res.status,503);assert.ok(!f.state.events.includes('read:pet_care_entries'));
});
test('ownership, assistant binding, and cancellation remain deterministic',async()=>{
 const f=fixture();assert.equal((await f.send()).status,200);
 assert.equal((await f.confirm(id(72))).status,404);assert.equal((await f.confirm(id(71),'confirm',id(62))).status,404);
 f.state.options.confirmOwner=id(2);assert.equal((await f.confirm()).status,404);f.state.options.confirmOwner=id(1);
 const result=await(await f.confirm(id(71),'cancel')).json();assert.equal(result.action.status,'cancelled');assert.equal(result.continuation,undefined);assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.state.planner,1);
});
test('fixed emergency response requires no Brain, factual read, capability, or save',async()=>{
 const f=fixture({modelDown:true});const result=await(await f.send('Cedar cannot breathe. Save this note.')).json();assert.equal(result.success,true);assert.match(result.response.directAnswer,/emergency veterinarian/);assert.equal(f.state.planner,0);assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.rows.ask_action_capabilities.length,0);assert.deepEqual(f.state.events,[]);
});
test('route has one interpretation and no owner-note or task persistence authority',()=>{
 const route=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');assert.doesNotMatch(route,/persist_ask_owner_note|persistOwnerNote|resolveOwnerNoteRequest|splitOwnerNoteAndCompanion|executeAskTask|apply_ask_task|findExistingCareEventForSaveRequest/);
 assert.equal([...route.matchAll(/await interpretAskQuestion\(/g)].length,1);assert.ok(route.indexOf('await interpretAskQuestion(')<route.indexOf('await buildFurviseContext('));
 const planning=readFileSync(new URL('../app/lib/intelligence/planning-context.ts',import.meta.url),'utf8');assert.deepEqual([...planning.matchAll(/\.from\("([^"]+)"\)/g)].map(m=>m[1]),['dog_profiles','ask_conversations','ask_conversation_messages']);
});

test('invalid first append ticket rejects once, with no factual read or write',async()=>{
 for(const change of [{petName:'Foreign'}, {bodyQuote:'invented text'}, {companionQuote:'Cedar refused lunch.'}]) {
  const p=proposal();p.appendJob={...p.appendJob,...change};const f=fixture({proposal:p});
  assert.equal((await f.send()).ok,false);assert.equal(f.state.planner,1);assert.equal(f.rows.pet_care_entries.length,2);
  assert.ok(!f.state.events.includes('read:pet_care_entries'));assert.ok(!f.state.events.includes('heart:execute'));
 }
});
test('unavailable companion history retains the successful receipt and reports unavailable coverage',async()=>{
 const f=fixture({readFailure:true});assert.equal((await f.send()).status,200);
 const result=await(await f.confirm()).json();assert.equal(result.action.status,'succeeded');assert.equal(f.rows.pet_care_entries.length,3);
 assert.ok(f.rows.ask_action_capabilities[0].receipt);assert.equal(result.continuation.labs.coverage.status,'unavailable');
 assert.deepEqual(result.continuation.labs.records,[]);assert.match(result.continuation.response.directAnswer,/couldn’t retrieve/);
 assert.equal(f.state.planner,1);
});
