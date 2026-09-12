import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'server-only') return {shortCircuit:true,url:'data:text/javascript,export default {}'};
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier,context.parentURL);
    for(const suffix of ['.ts','/index.ts']) if(existsSync(fileURLToPath(url.href+suffix))) return next(url.href+suffix,context);
  }
  return next(specifier,context);
}});
const {buildVetBriefDraft}=await import('../app/lib/vet-brief/builder.ts');
const {parseVetBriefContent,vetBriefContentFields}=await import('../app/lib/vet-brief/content.ts');
const {parseVetBriefAppointmentPlan,validBriefDay}=await import('../app/lib/vet-brief/appointment-plan.ts');
const {vetBriefEvidence}=await import('../app/lib/vet-brief/evidence.ts');
const {vetBriefUrgency}=await import('../app/lib/vet-brief/urgency.ts');
const {vetBriefReport}=await import('../app/lib/vet-brief/report.ts');
const baseline=buildVetBriefDraft({profile:{name:'Synthetic',species:'dog',breed:'Synthetic — Labrador',age_value:5,age_unit:'years'},careEntries:[],memories:[],from:'2026-06-01',to:'2026-09-12',reasonForVisit:'Review'}).document;
const content=Object.fromEntries(vetBriefContentFields.map(key=>[key,key==='events'?[]:baseline[key]??'']));
content.visitSummary='Owner reports weakness today; the cause is unknown.';
content.events=[{kind:'observation',category:'Symptoms',date:'2026-09-12',text:'Owner reports weakness; no cause established.'}];
const raw=()=>({content:structuredClone(content),sourceRecordIds:['verified'],confidence:'low'});
test('server assembles immutable metadata and retains explicit owner report, doses, conflicts and negation',()=>{
  const input=raw(); input.content.events.push({kind:'medication',category:'Medication',date:'2026-09-11',text:'Saved note: 2.5 mg twice daily for 5 days, then 1.25 mg once daily for 5 days, starting tomorrow. Owner now says completed yesterday; dates conflict.'});
  const parsed=parseVetBriefContent(input,baseline,['verified']);
  assert.equal(parsed.document.pet,baseline.pet);
  assert.deepEqual(parsed.document.dateRange,baseline.dateRange);
  assert.equal(parsed.document.medicationsSupplements[0].text,input.content.events[1].text);
  assert.match(parsed.document.concernTimeline[0].text,/no cause established/);
});
test('model cannot overwrite identity, settings or insert an unauthorized source',()=>{
  const injected=raw();injected.content.pet={name:'Another pet'};
  assert.equal(parseVetBriefContent(injected,baseline,['verified']),null);
  assert.equal(parseVetBriefContent({...raw(),sourceRecordIds:['other-owner']},baseline,['verified']),null);
  assert.equal(parseVetBriefContent({...raw(),content:{visitSummary:'missing required fields'}},baseline,['verified']),null);
});
test('appointment plan accepts long history but rejects impossible dates, future endpoints and over-budget search',()=>{
  const plan={focus:'Review',from:'1926-09-12',to:'2026-09-12',topics:[{label:'Medication',terms:['prednisone','taper']}],questionsToResolve:['Reconcile dates']};
  assert.ok(parseVetBriefAppointmentPlan(plan,'2026-09-12T12:00:00Z'));
  assert.ok(parseVetBriefAppointmentPlan({...plan,from:null},'2026-09-12'));
  for(const patch of [{to:'2026-09-13'},{from:'2026-02-30'},{topics:Array(7).fill(plan.topics[0])},{topics:[{label:'x',terms:Array(3).fill('term')}]}]) assert.equal(parseVetBriefAppointmentPlan({...plan,...patch},'2026-09-12'),null);
  assert.equal(validBriefDay('2026-02-30'),false);
  assert.ok(parseVetBriefAppointmentPlan({...plan,topics:Array.from({length:6},(_,i)=>({label:'Topic '+i,terms:['stem'+i]}))},'2026-09-12'));
  assert.equal(parseVetBriefAppointmentPlan({...plan,topics:Array(4).fill(plan.topics[0])},'2026-09-12'),null); // six total stems, not six pairs
});
for(const [message,level] of [
  ['Rowan is lethargic, weak in his hind legs, and breathing heavily today. Look back over his full 5-year history.','emergency'],
  ['Mochi cannot breathe.','emergency'],
  ['Rowan is not breathing heavily today.',null],
  ['In 2021 Rowan was breathing heavily. He is normal today.',null],
  ['Hypothetically, what if Rowan were breathing heavily?',null],
  ['We are going for vaccinations.',null],
]) test(`urgency scope: ${message}`,()=>assert.equal(vetBriefUrgency(message),level));
test('urgent guidance survives section exclusions and generation-independent publication',()=>{
  const sections=vetBriefReport({...baseline,urgency:'emergency',excludedSections:['visit-reason','timeline']});
  assert.equal(sections[0].id,'urgency');assert.match(sections[0].items[0].text,/Do not wait/);
});
test('one evidence bundle uses only corrected retained records and exposes omissions to generation/review',()=>{
  const context={currentTimestamp:'2026-09-12T00:00:00Z',currentMessage:'Owner now reports end yesterday',pet:{name:'Synthetic'},memories:[],legacyPetMemories:[],activeConcerns:[],recentlyResolvedConcerns:[],conversationTurns:[],careEntries:[{id:'deleted',note:'obsolete dose'}],askHistory:{entries:[{id:'verified',occurred_at:'2026-09-11',note:'corrected dose',category:'medication'}],originals:[{id:'deleted',note:'obsolete dose'}],coverage:{retrieval:'partial',corrections:'unknown',continuation:[{}],reasons:['effective_evidence_budget']}}};
  const result=vetBriefEvidence(context,{focus:'Review'});
  assert.deepEqual(result.allowedIds,['verified']);
  assert.equal(result.evidence.records[0].text,'corrected dose');
  assert.ok(!JSON.stringify(result).includes('obsolete dose'));
  assert.match(result.warnings.join(' '),/Only part/);
  assert.equal(result.evidence.currentOwnerReport,context.currentMessage);
});
const {vetBriefClaimSourceIds,verifyVetBriefClaimSources}=await import('../app/lib/vet-brief/source-ids.ts');
test('corrected claim provenance saves through the authenticated RPC and never trusts foreign, inactive or invented IDs',async()=>{
 const id='11111111-1111-4111-8111-111111111111', foreign='22222222-2222-4222-8222-222222222222';
 assert.deepEqual(vetBriefClaimSourceIds(['claim-'+id,'claim-'+id,'claim-invalid',id]),[id]);
 let args;
 const db={rpc(name,input){assert.equal(name,'read_ask_history_correction_page');args=input;return {abortSignal:async()=>({data:{truncated:false,claims:[{id,user_id:'owner',subject_id:'pet',persistence_destination:'history',knowledge_status:'effective'},{id:foreign,user_id:'other',subject_id:'pet',persistence_destination:'history',knowledge_status:'effective'}]},error:null})};}};
 assert.deepEqual(await verifyVetBriefClaimSources(db,['claim-'+id,'claim-'+foreign],'owner','pet'),[id]);
 assert.deepEqual(args.p_seed_pet_ids,[]);
 await assert.rejects(()=>verifyVetBriefClaimSources({rpc:()=>({abortSignal:async()=>({error:{code:'42501'}})})},['claim-'+id],'owner','pet'),/verification_unavailable/);
});
const {parseVetBriefPublicationReview}=await import('../app/lib/vet-brief/publication-review.ts');
const verdict={factsSupported:true,importantHistoryPreserved:true,categoriesAccurate:true,uncertaintyPreserved:true,noDuplication:false,questionsUseful:true,visitFocused:true,repairInstructions:'Remove the alleged duplicate.',duplicatePairs:[]};
test('a duplication verdict requires real same-date entries in different supporting sections; factual failures remain failures',()=>{
 const document={...baseline,visitSummary:'A synopsis may repeat medication facts.',concernTimeline:[{date:'2026-09-11',text:'Medication course recorded.'}],medicationsSupplements:[{date:'2026-09-11',text:'The medication course was recorded.'}]};
 assert.equal(parseVetBriefPublicationReview(verdict,document).noDuplication,true);
 for(const pair of [{firstSection:'overview',firstItem:0,secondSection:'medications',secondItem:0},{firstSection:'timeline',firstItem:99,secondSection:'medications',secondItem:0}]) assert.equal(parseVetBriefPublicationReview({...verdict,duplicatePairs:[pair]},document).noDuplication,true);
 const pair={firstSection:'timeline',firstItem:0,secondSection:'medications',secondItem:0};
 assert.equal(parseVetBriefPublicationReview({...verdict,duplicatePairs:[pair]},document).noDuplication,false);
 const differentDate={...document,medicationsSupplements:[{date:'2026-09-12',text:'The medication course was recorded.'}]};
 assert.equal(parseVetBriefPublicationReview({...verdict,duplicatePairs:[pair]},differentDate).noDuplication,true);
 assert.equal(parseVetBriefPublicationReview({...verdict,factsSupported:false},document).factsSupported,false);
 assert.equal(parseVetBriefPublicationReview({...verdict,duplicatePairs:undefined},document),null);
});
test('one canonical event gets one placement, preserving owner symptom and conflicting saved medication separately',()=>{
 const input=raw();input.content.events.push({kind:'medication',category:'Medication',date:'2026-09-11',text:'Saved prescription starts tomorrow, conflicting with the owner report.'});
 const doc=parseVetBriefContent(input,baseline,['verified']).document;
 assert.equal(doc.concernTimeline.length,1);assert.equal(doc.medicationsSupplements.length,1);
 assert.deepEqual(doc.ownerReportedChanges,[]);assert.deepEqual(doc.relevantCareHistory,[]);
 assert.match(doc.medicationsSupplements[0].text,/conflicting/);
});
