import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explicitNoteTime } from '../app/lib/intelligence/owner-note-request.ts';
import { processOwnerNoteJob, validateOwnerNoteEnrichment } from '../app/lib/intelligence/owner-note-enrichment.ts';
import { validateAppendJob } from '../app/lib/furvise-brain/append-job.ts';
import { buildAskRequestPayload } from '../app/lib/ask-request-contract.ts';
const pet = { id: 'rowan', name: 'Rowan' };
for (const [message,body] of [
  ['Maybe Rowan was a bit off. Please save this note.','Maybe Rowan was a bit off.'],
  ['Log this note for Rowan: possibly tired, normal appetite.','possibly tired, normal appetite.'],
  ['Rowan enjoyed a new toy. Save this to his history.','Rowan enjoyed a new toy.'],
]) {
  test(`no clinical-merit gate: ${message}`, () => {
    const job=validateAppendJob({operation:'append',petName:'Rowan',bodyQuote:body,companionQuote:null},
      {id:'source',role:'user',text:message},[{...pet,user_id:'owner'}],'owner');
    assert.equal(job.items[0].body.text,body);assert.equal(message.slice(job.items[0].body.start,job.items[0].body.end),body);
  });
}
test('unknown, multiple, invalid and DST-shifted dates cannot reject a note', () => {
  for (const text of ['last summer', '2026-02-30', '2026-01-01 and 2026-01-02', 'March 8, 2026 at 2:30 AM']) assert.equal(explicitNoteTime(text, 'America/Vancouver').occurredAt, null);
});
test('submission mode is part of the immutable request payload', () => {
  const payload = buildAskRequestPayload({ message: 'text', mode: 'note', petId: 'pet', logicalTurnId: 'turn', locale: 'en', conversationId: null });
  assert.equal(payload.mode, 'note');
  assert.notEqual(JSON.stringify(payload), JSON.stringify({ ...payload, mode: undefined }));
});
test('lost write acknowledgment replays the same capability and returns one receipt without AI', async () => {
  const f=httpHarness({lostAcknowledgment:true});assert.equal((await f.send()).status,200);
  assert.equal((await f.confirm()).status,503);assert.equal(f.rows.pet_care_entries.length,3);
  f.state.options.modelDown=true;
  const receipt=await(await f.confirm()).json();assert.equal(receipt.action.status,'succeeded');assert.equal(receipt.changed,false);
  assert.equal(f.rows.pet_care_entries.length,3);assert.equal(f.state.planner,1);
  assert.equal(f.rows.ask_action_capabilities.length,1);assert.ok(f.rows.ask_action_capabilities[0].receipt);
});
test('permission failures never produce success or retry under another identity', async () => {
  const f=httpHarness({confirmOwner:'foreign'});assert.equal((await f.send()).status,200);
  assert.equal((await f.confirm()).status,404);assert.equal(f.rows.pet_care_entries.length,2);
  assert.equal(f.state.events.filter(event=>event==='heart:execute').length,0);
});
const job={id:'job',entry_id:'entry',user_id:'owner',pet_profile_id:'rowan',pet_name:'Rowan',source_note:'Rowan might be tired, but ate normally.',lease_token:'lease',attempts:1};
for (const failure of ['offline','timeout','invalid-json']) {
  test(`extraction ${failure} only changes the job; saved note remains intact`,async()=>{
    const before=structuredClone(job);const completed=[];
    assert.equal(await processOwnerNoteJob(job,{extract:async()=>{if(failure==='invalid-json')return {};throw new Error(failure);},finish:async(...args)=>completed.push(args)}),'retry');
    assert.deepEqual(job,before);assert.equal(completed[0][1],null);assert.equal(completed[0][2],'NOTE_EXTRACTION_UNAVAILABLE');
  });
}
test('low confidence completes as uninterpreted; no clinical state write is available',async()=>{
  let saved;
  assert.equal(await processOwnerNoteJob(job,{extract:async()=>({version:'owner-note.v1',observations:[{quote:job.source_note,kind:'symptom',certainty:'uncertain',confidence:0.4}]}),finish:async(_,result)=>{saved=result;}}),'uninterpreted');
  assert.deepEqual(saved,{version:'owner-note.v1',observations:[]});
});
test('fabricated extraction is rejected',()=>assert.throws(()=>validateOwnerNoteEnrichment({version:'owner-note.v1',observations:[{quote:'Rowan has kidney disease',kind:'symptom',certainty:'reported',confidence:1}]},job.source_note)));
// Ask migrated from a raw-note fast path to typed proposals and confirmed Heart
// capabilities. Keep the shared date/enrichment tests above for their remaining callers.
import { engineFixture as httpHarness } from './helpers/ask-route-ordering.mjs';
test('route interprets before facts and never persists an owner note outside Heart',()=>{
  const source=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/persistOwnerNote|persist_ask_owner_note|savedNoteResponse/);
  assert.ok(source.indexOf('await interpretAskQuestion(')<source.indexOf('await buildFurviseContext('));
});
for (const options of [{},{conversationFailure:true},{mixed:true}]) test(`HTTP confirmed save is isolated from model availability: ${JSON.stringify(options)}`,async()=>{
  const f=httpHarness(options);const proposal=await f.send();
  assert.equal(f.rows.pet_care_entries.length,2);
  if(options.conversationFailure){assert.equal(proposal.ok,false);assert.equal(f.rows.ask_action_capabilities.length,0);return;}
  assert.equal(proposal.status,200);f.state.options.modelDown=true;
  const response=await f.confirm();const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.action.status,'succeeded');assert.ok(f.rows.ask_action_capabilities[0].receipt);
  assert.equal(f.rows.pet_care_entries.length,3);assert.equal(f.state.planner,1);
  assert.equal((await(await f.confirm()).json()).changed,false);assert.equal(f.rows.pet_care_entries.length,3);
});
test('HTTP unauthorized and rejected database writes cannot claim saved success',async()=>{
  for(const options of [{denied:true},{dbFailure:true}]){
    const f=httpHarness(options);const proposal=await f.send();
    const response=options.denied?proposal:await f.confirm();
    assert.equal(response.ok,false);assert.equal(f.rows.pet_care_entries.length,2);
  }
});
test('emergency advice remains visible with provider and storage unavailable; no implicit save',async()=>{
  const f=httpHarness({dbFailure:true,modelDown:true});const body=await(await f.send('Cedar cannot breathe. Save this note.')).json();
  assert.equal(body.success,true);assert.match(body.response.directAnswer,/emergency veterinarian/);
  assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.state.planner,0);
});

for (const followup of ['tell me if I should use leftover tablets.', 'calculate the percentage change.', 'compare this with the older record.', 'convert the reported weight to pounds.', 'list questions for the clinic.']) {
  test(`independent follow-up does not block or silently bypass note processing: ${followup}`, () => {
    const text = `Rowan ate normally. Log this note to his care history. Then ${followup}`;
    const job=validateAppendJob({operation:'append',petName:'Rowan',bodyQuote:'Rowan ate normally.',companionQuote:followup},
      {id:'source',role:'user',text},[{...pet,user_id:'owner'}],'owner');
    assert.equal(job.items[0].body.text,'Rowan ate normally.');assert.equal(job.companion.text,followup);
    assert.equal(text.slice(job.companion.start,job.companion.end),followup);
    assert.notEqual(job.items[0].body.id,job.companion.id);
  });
}
