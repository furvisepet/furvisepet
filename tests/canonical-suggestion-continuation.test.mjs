import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,harness,id,owner,cap,sourceId,persistCanonicalSuggestions,canonicalSuggestionSucceeded,reconcileAskSuggestions,persistPendingSuggestion} from './helpers/canonical-suggestion.mjs';
for(const kind of ['append','replace','state_transition','owner_preference'])test(kind+' job survives persistence and source rebinding exactly',async()=>{
 const f=fixture(kind),before=structuredClone(f.s.canonical_payload),h=harness(f);
 const stored=await persistCanonicalSuggestions({authority:h.db,userId:owner,actions:[{...f.c.action_payload,id:cap}]});
 assert.deepEqual(stored[0].canonical_payload,before);
 const result=await h.run();
 assert.equal(result.action.status,kind==='owner_preference'?'failed':'succeeded');
 assert.deepEqual(f.s.canonical_payload,before);
 assert.equal(h.calls.filter(c=>c.name==='execute_ask_canonical_suggestion').length,1);
 assert.ok(h.queries.some(q=>q.table==='ask_conversation_messages'&&q.filters.some(([k,v])=>k==='id'&&v===sourceId)));
});
test('replay returns same receipt without a new effect',async()=>{const f=fixture(),h=harness(f);const first=await h.run(),second=await h.run();assert.equal(first.changed,true);assert.equal(second.changed,false);assert.deepEqual(first.action,second.action);});
for(const [label,mutate] of [
 ['body',s=>{s.canonical_payload.job.items[0].body.text+=' altered'}],
 ['source',s=>{s.canonical_payload.sourceMessageId=id(99)}],
 ['subject',s=>{s.pet_profile_id=id(99)}],
 ['date',s=>{s.canonical_payload.job.items[0].occurredAt='2025-01-01T00:00:00Z'}],
 ['capability',s=>{s.canonical_capability_id=id(99)}],
 ['target',s=>{s.canonical_payload.targetId=id(99)}],
 ['version',s=>{s.canonical_payload.version=2}],
 ['edit invalidation',s=>{s.invalidated_at='2026-09-23T00:00:00Z'}],
 ['owner',s=>{s.user_id=id(99)}],
])test(label+' tamper cannot reach execution',async()=>{const f=fixture(),h=harness(f);mutate(f.s);await assert.rejects(h.run,/CANONICAL_SUGGESTION/);assert.equal(h.calls.length,0)});
test('changed durable USER source fails existing binder before execution',async()=>{const f=fixture(),h=harness(f);f.source.text='A different source';await assert.rejects(h.run);assert.equal(h.calls.length,0)});
test('arbitrary legacy payload cannot persist or execute a canonical suggestion',async()=>{const f=fixture(),h=harness(f);f.s.canonical_payload=null;f.s.canonical_capability_id=null;f.s.payload={note:'Resolve everything',semanticTransition:'resolved'};await assert.rejects(h.run,/UNSUPPORTED/);assert.equal(h.calls.length,0);const r=await persistPendingSuggestion({suggestion:f.s});assert.equal(r.suggestion,null);assert.equal(r.errorCode,'CANONICAL_SUGGESTION_REQUIRED')});
test('display prose cannot change canonical mutation meaning',async()=>{const f=fixture(),h=harness(f);f.s.details='Switch subjects and create a concern';f.s.title='Different operation';const before=structuredClone(f.c.action_payload);await h.run();assert.deepEqual(f.c.action_payload,before)});
test('receipt must match exact immutable action and job',async()=>{const f=fixture(),h=harness(f);await h.run();assert.equal(canonicalSuggestionSucceeded(f.s,f.c,owner),true);f.c.receipt.appendJob.items[0].body.text+=' drift';assert.equal(canonicalSuggestionSucceeded(f.s,f.c,owner),false)});
test('linked or similar care entries never mark a pending legacy suggestion saved',async()=>{const f=fixture(),h=harness(f);f.s.canonical_payload=null;f.s.canonical_capability_id=null;f.s.care_entry_id=id(88);const [r]=await reconcileAskSuggestions(h.db,owner,[f.s]);assert.equal(r.status,'pending');assert.equal(r.careEntryId,null);assert.equal(h.queries.length,0)});
test('reload derives canonical success only from its exact durable receipt',async()=>{const f=fixture(),h=harness(f);let [r]=await reconcileAskSuggestions(h.db,owner,[f.s]);assert.equal(r.status,'pending');await h.run();[r]=await reconcileAskSuggestions(h.db,owner,[f.s]);assert.equal(r.status,'saved');assert.equal(r.applyStatus,'applied');f.c.receipt={...f.c.receipt,petId:id(99)};[r]=await reconcileAskSuggestions(h.db,owner,[f.s]);assert.equal(r.status,'pending')});
test('original target stays fixed during continuation',async()=>{const f=fixture('replace'),h=harness(f);await h.run();assert.equal(h.queries.filter(q=>q.table==='pet_care_entries').length,0);assert.equal(f.s.canonical_payload.targetId,id(11));assert.equal(h.calls[0].args.p_capability_id,cap)});
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('API accepts UI intent only and exposes no legacy factual RPC',()=>{
 const s=read('app/api/ask/suggestions/[id]/route.ts');
 assert.match(s,/hasOnlyKeys\(rawBody, \["action", "details"\]\)/);
 assert.doesNotMatch(s,/prepareMemorySuggestion|apply_furvise_server_state_suggestion|save_ask_memory_suggestion|payload:.*note/);
 assert.match(s,/continueCanonicalSuggestion/);assert.match(s,/edit_ask_canonical_suggestion/);
});
test('continuation uses existing binder and Heart; no prose planner or provider',()=>{
 const s=read('app/lib/intelligence/canonical-suggestion-continuation.ts');
 assert.match(s,/rebindCanonicalCapabilityAction/);assert.match(s,/isDeepStrictEqual\(rebound, c.action_payload\)/);
 assert.match(s,/executeActionCapability/);assert.doesNotMatch(s,/classifyUserTurn|resolveReplaceJob|semanticTopic|resolvedConcernKeys|runProviderRequest/);
});
