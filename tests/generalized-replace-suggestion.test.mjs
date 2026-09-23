import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,harness,owner,pet} from './helpers/canonical-suggestion.mjs';
const {validateReplaceJob}=await import('../app/lib/furvise-brain/replace-job.ts');
function exact(){
 const f=fixture('replace'),job=validateReplaceJob({operation:'replace',target:{kind:'exact_record',ref:'given'},
 petName:'Subject',instructionQuote:f.source.text.trim(),bodyQuote:f.c.action_payload.replaceJob.body.text,constraints:[]},
 f.source,{id:pet,name:'Subject'},{ownerId:owner,references:[{ref:'given',recordId:f.c.target_id,ownerId:owner,petId:pet,
 updatedAt:f.c.target_updated_at,createdAt:'2026-09-19T00:00:00Z',body:'Original',eventAt:'2026-09-19T00:00:00Z'}]});
 f.c.action_payload.replaceJob=structuredClone(job);f.s.canonical_payload.job=structuredClone(job);
 return f;
}
test('exact REPLACE suggestion preserves selector, body and target through rebinding and replay',async()=>{
 const f=exact(),before=structuredClone(f.c.action_payload.replaceJob),h=harness(f);
 assert.equal((await h.run()).changed,true);assert.equal((await h.run()).changed,false);
 assert.deepEqual(f.c.action_payload.replaceJob,before);
 assert.equal(f.c.receipt.targetSourceId,'care:'+f.c.target_id);
 assert.ok(h.queries.every(q=>q.table!=='pet_care_entries'));
});
test('suggestion cannot convert exact selector into latest semantics',async()=>{
 const f=exact();f.s.canonical_payload.job.target='last_event_for_subject';
 await assert.rejects(harness(f).run(),/AUTHORITY_MISMATCH/);
});
