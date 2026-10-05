import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceSemanticsSnapshot,sourceSemanticsDigest,readAttributedSourceSemantics} from '../app/lib/intelligence/correction-relevance.ts';
import {readCorrectionRelevance} from '../app/lib/intelligence/correction-relevance-read.ts';
const original={id:'care',user_id:'owner',pet_profile_id:'pet',category:'general',title:'Owner note',note:'Exact ‘saved’ observation — α.',occurred_at:'2021-07-01T09:00:00.000Z',created_at:'2026-01-01T09:00:00.000Z',updated_at:'2026-01-01T09:00:00.000Z',intelligence_source_message_id:'source',care_event_metadata:{sourceSpanId:'source:0:29'},deleted_at:null};
function evidence(row,classification='observation',target=null){
 const payload=JSON.stringify({version:'source-semantics.v1',source:sourceSemanticsSnapshot(row),classification,target});
 return {user_id:'owner',subject_type:'pet',subject_id:'pet',source_message_lineage_id:'care',source_message_id:'source',claim_kind:'assertion',operation_type:'assert',knowledge_status:'unconfirmed',modality:'reported',persistence_destination:'none',governance_metadata:{sourceSemanticsPayload:payload},turn_payload_hash:sourceSemanticsDigest(payload)};
}
for(const classification of ['observation','unknown','attributed_correction'])test('permanent origin preserves exact '+classification+' evidence across live detachment',()=>{
 const target=classification==='attributed_correction'?{kind:'scope',from:'2021-07-01T00:00:00Z',to:'2021-08-01T00:00:00Z',conceptKey:null}:null;
 const claim=evidence(original,classification,target),before=JSON.stringify(claim);
 const detached={...original,canonical_ask_origin_message_id:'source',intelligence_source_message_id:null};
 assert.deepEqual(sourceSemanticsSnapshot(detached),sourceSemanticsSnapshot(original));
 assert.deepEqual(readAttributedSourceSemantics({...claim,source_message_id:null},detached,'owner'),JSON.parse(claim.governance_metadata.sourceSemanticsPayload));
 assert.equal(JSON.stringify(claim),before);
});
for(const change of [{canonical_ask_origin_message_id:'other'},{updated_at:'2026-01-02T09:00:00.000Z'},{note:'Edited'},{user_id:'foreign'},{pet_profile_id:'foreign'},{care_event_metadata:{sourceSpanId:'other'}},{deleted_at:'2026-01-02T09:00:00Z'}])test('detached reader rejects changed generation '+JSON.stringify(change),()=>{
 assert.equal(readAttributedSourceSemantics(evidence(original),{...original,intelligence_source_message_id:null,canonical_ask_origin_message_id:'source',...change},'owner'),null);
});
test('legacy source snapshot remains unchanged',()=>assert.equal(sourceSemanticsSnapshot(original).sourceMessageId,'source'));
test('actual correction reader accepts complete detached evidence without a message read',async()=>{
 const detached={...original,canonical_ask_origin_message_id:'source',intelligence_source_message_id:null};let calls=0;
 const db={rpc(name,args){calls++;assert.equal(name,'read_ask_source_semantics');assert.deepEqual(args,{p_pet_ids:['pet'],p_source_ids:['care']});return{abortSignal(){return Promise.resolve({error:null,data:{claims:[{...evidence(original),source_message_id:null}],sources:[detached],targets:[],complete:true,limit:76}});}};},from(){throw Error('Transcript access forbidden');}};
 const result=await readCorrectionRelevance({db,ownerId:'owner',petIds:['pet'],candidates:[detached],domain:{from:'2021-07-01T00:00:00Z',to:'2021-08-01T00:00:00Z'},deadline:Date.now()+2000});
 assert.equal(calls,1);assert.equal(result.bySource.size,1);assert.deepEqual(result.unresolved,[]);
});
test('forward migration retains live FK, generation checks and immutable historical migrations',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261004215000_detach_canonical_dialogue_preserve_origin.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/disable\s+trigger|drop\s+constraint|session_replication_role|pg_trigger_depth|request\.jwt/i);
 assert.match(sql,/canonical_ask_origin_required/);assert.match(sql,/not exists\(select 1 from public\.ask_conversation_messages/);
 assert.match(sql,/CANONICAL_ASK_DETACH_GENERATION_CHANGED/);assert.match(sql,/to_jsonb\(new_row\)-'intelligence_source_message_id'/);
 assert.match(sql,/coalesce\(e\.canonical_ask_origin_message_id,e\.intelligence_source_message_id\)/);
 assert.match(sql,/new\.care_event_metadata->>'sourceSpanId' is distinct from old/);
 assert.equal((sql.match(/create or replace function public\.pet_care_entries_touch_updated_at/g)||[]).length,2);
});
