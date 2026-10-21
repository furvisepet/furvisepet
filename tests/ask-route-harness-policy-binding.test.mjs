import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,engineFixture,id,proposal,cedar} from './helpers/ask-route-ordering.mjs';

test('real policy dependency keeps public write proposal unavailable and unpersisted',async()=>{
 const f=fixture();const response=await f.send();const body=await response.json();
 assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.match(body.response.directAnswer,/cannot change records/);
 assert.equal(f.rows.ask_action_capabilities.length,0);assert.equal(f.rows.pet_care_entries.length,2);
 assert.equal(f.state.planner,1);assert.equal(f.state.errors.length,0);assert.ok(!f.state.events.includes('heart:execute'));
});
test('engine proposal is confirmation-only; real Heart receipt precedes scoped saved read',async()=>{
 const f=engineFixture();const response=await f.send();const body=await response.json();
 assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(body.persistenceMode,'confirmation_required');
 assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.rows.ask_action_capabilities.length,1);assert.equal(f.rows.ask_action_capabilities[0].receipt,null);
 assert.ok(!f.state.events.includes('read:pet_care_entries'));f.state.options.modelDown=true;
 const confirmed=await f.confirm();const result=await confirmed.json();assert.equal(confirmed.status,200,JSON.stringify(result));
 assert.equal(result.action.status,'succeeded');assert.equal(result.changed,true);assert.equal(f.rows.pet_care_entries.length,3);
 assert.deepEqual(result.continuation.labs.records.map(r=>r.id),[id(52),id(51)]);
 assert.ok(f.state.events.indexOf('heart:receipt')<f.state.events.indexOf('read:pet_care_entries'));
 assert.equal((await(await f.confirm()).json()).changed,false);assert.equal(f.rows.pet_care_entries.length,3);assert.equal(f.state.planner,1);
});
test('missing source context reaches original Binder denial and never prepares a write',async()=>{
 const p=proposal();p.appendJob.bodyQuote='Text not present in the USER source.';
 const f=engineFixture({proposal:p});const response=await f.send();
 assert.equal(response.status,503);assert.equal(f.rows.ask_action_capabilities.length,0);assert.equal(f.rows.pet_care_entries.length,2);
 assert.ok(f.state.errors.some(x=>x.error?.diagnostics?.providerErrorCode?.startsWith('ASK_REQUEST_')));
 assert.ok(!f.state.events.includes('heart:execute'));
});
test('foreign subject cannot prepare capability even with engine mutation opt-in',async()=>{
 const f=engineFixture();f.rows.dog_profiles[0].user_id=id(2);
 const response=await f.send();assert.equal(response.ok,false);assert.equal(f.rows.ask_action_capabilities.length,0);
 assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.state.planner,0);
});

test('cancelled proposal has no effect and opens no companion read or provider phase',async()=>{
 const f=engineFixture();assert.equal((await f.send()).status,200);
 const response=await f.confirm(id(71),'cancel');const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.action.status,'cancelled');assert.equal(body.continuation,undefined);
 assert.equal(f.rows.pet_care_entries.length,2);assert.ok(!f.state.events.includes('read:pet_care_entries'));assert.equal(f.state.planner,1);
});
test('wrong assistant binding cannot execute an otherwise valid owned capability',async()=>{
 const f=engineFixture();assert.equal((await f.send()).status,200);
 assert.equal((await f.confirm(id(71),'confirm',id(62))).status,404);
 assert.equal(f.rows.pet_care_entries.length,2);assert.ok(!f.state.events.includes('heart:execute'));
 assert.equal(f.rows.ask_action_capabilities[0].receipt,null);
});
