import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock,promptHas} from './helpers/lifetime-harness.mjs';
import {stressPets,rows} from './fixtures/ask-ten-pet-five-year-stress.mjs';

const byName=Object.fromEntries(stressPets.map(p=>[p.name,p]));
const proposal=(patch={})=>({operation:'recall',subject:'explicit',petNames:['Aster'],topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'saved_history',...patch});
const review={approved:true};
const narrative=(text,sourceIds)=>({sentences:[{text,sourceIds:sourceIds.map(id=>'care:'+id),calculations:[]}]});
async function run(t,{q,pet='Aster',p,answer,sources,expectReview=1}){
  clock(t);
  return exercise(q,{fixturePets:stressPets,petId:byName[pet].id,conversationPetId:byName[pet].id,rows,history:true,
    interpretationProposal:p,providerOverrides:{answer,relevantContextIds:sources.map(id=>'care:'+id),historyNarrative:narrative(answer,sources)},
    expectedReviewCalls:expectReview,reviewResponse:review});
}

test('1 five-year Aster endpoint comparison retains 2022 and 2026 weights',async t=>{
  const r=await run(t,{q:'Compare Aster body weight on February 14, 2022 with August 14, 2026.',p:proposal({operation:'comparison',selection:'comparison',petNames:['Aster'],terms:['weight'],from:'2022-02-14',to:'2026-08-15'}),
    answer:'Aster was 22.4 kg on February 14, 2022 and 20.9 kg on August 14, 2026.',sources:['aster-weight-2022','aster-weight-2026']});
  assert.ok(promptHas(r,'aster-weight-2022'));assert.ok(promptHas(r,'aster-weight-2026'));
  assert.match(r.result.reasoning.answer.summary,/22\.4/);assert.match(r.result.reasoning.answer.summary,/20\.9/);
});

test('2 late Birch correction stays visible and old food is not silently treated as settled truth',async t=>{
  const r=await run(t,{q:'What do Birch records say about the March 2022 food switch, including any later correction?',pet:'Birch',
    p:proposal({petNames:['Birch'],selection:'summary',terms:['food','switch','correct'],from:'2022-03-01',to:'2026-09-01'}),
    answer:'Birch has an older March 2022 note naming beef and oat, plus a later correction saying turkey and oat, not beef and oat. The correction is preserved explicitly.',sources:['birch-food-old','birch-food-corrected']});
  assert.ok(promptHas(r,'birch-food-old'));assert.ok(promptHas(r,'birch-food-corrected'));
  assert.match(r.result.reasoning.answer.summary,/turkey/i);
});

test('3 Cedar multi-stage medication schedule survives four years of newer noise',async t=>{
  const r=await run(t,{q:'Give Cedar full recorded medication schedule from May 2023 and the last confirmed dose date.',pet:'Cedar',
    p:proposal({petNames:['Cedar'],selection:'summary',terms:['medicine','dose'],from:'2023-05-01',to:'2023-06-01'}),
    answer:'Cedar recorded 10 mg once daily for 4 days, then 5 mg once daily for 3 days; the last confirmed dose was May 16, 2023.',sources:['cedar-med']});
  assert.ok(promptHas(r,'cedar-med'));assert.match(r.result.reasoning.answer.summary,/May 16, 2023/);
});

test('4 Dune resolution and later recurrence remain separate episodes across five-year history',async t=>{
  const r=await run(t,{q:'Summarize Dune paw itching from 2022 through the 2026 recurrence.',pet:'Dune',
    p:proposal({petNames:['Dune'],selection:'summary',terms:['itching','paw'],from:'2022-01-01',to:'2026-09-01'}),
    answer:'Dune had paw itching in June 2022, it resolved on June 6, 2022, and mild paw itching returned on July 20, 2026.',sources:['dune-itch-2022','dune-resolved-2022','dune-itch-2026']});
  for(const id of ['dune-itch-2022','dune-resolved-2022','dune-itch-2026'])assert.ok(promptHas(r,id),id);
});

test('5 Echo latest saved-note recall keeps recorded chronology without inventing clinical event time',async t=>{
  const r=await run(t,{q:'What is the latest saved note about Echo appetite and energy?',pet:'Echo',
    p:proposal({petNames:['Echo'],selection:'latest',terms:['appetite','energy']}),
    answer:'The latest matching saved note says Echo seemed tired and ate only half breakfast.',sources:['echo-owner-note']});
  assert.ok(promptHas(r,'echo-owner-note'));const record=r.prompt.contextRecords.find(x=>x.id==='care:echo-owner-note');
  assert.equal(record.occurredAt,null);assert.equal(record.metadata.recordedAt,'2024-09-05T16:30:00Z');
});

test('6 three-pet weight comparison keeps each pet isolated',async t=>{
  const r=await run(t,{q:'Compare Fennel, Grove, and Hazel body weights from August 18, 2026.',pet:'Fennel',
    p:proposal({petNames:['Fennel','Grove','Hazel'],operation:'comparison',selection:'comparison',terms:['weight'],from:'2026-08-18',to:'2026-08-19'}),
    answer:'Fennel was 8.2 kg, Grove was 12.7 kg, and Hazel was 4.4 kg on August 18, 2026.',sources:['fennel-weight','grove-weight','hazel-weight']});
  for(const id of ['fennel-weight','grove-weight','hazel-weight'])assert.ok(promptHas(r,id),id);
  assert.deepEqual(new Set(r.result.reasoning.referencedRecords.filter(x=>x.id.startsWith('care:')).map(x=>x.petId)).size>=3,true);
});

test('7 Indigo five-year activity trend retains every yearly endpoint',async t=>{
  const ids=['indigo-act-2022','indigo-act-2023','indigo-act-2024','indigo-act-2025','indigo-act-2026'];
  const r=await run(t,{q:'Across 2022, 2023, 2024, 2025, and 2026, list Indigo puzzle-play minutes for each year.',pet:'Indigo',
    p:proposal({petNames:['Indigo'],selection:'summary',terms:['puzzle','play'],from:'2022-01-01',to:'2026-09-01'}),
    answer:'Indigo puzzle play was 6 minutes in 2022, 8 in 2023, 11 in 2024, 14 in 2025, and 18 in 2026.',sources:ids});
  for(const id of ids)assert.ok(promptHas(r,id),id);
});

test('8 deleted Juniper draft never re-enters evidence',async t=>{
  const r=await run(t,{q:'What saved Juniper notes exist around November 2–3, 2025?',pet:'Juniper',
    p:proposal({petNames:['Juniper'],selection:'summary',terms:['sleep','walk'],from:'2025-11-02',to:'2025-11-04'}),
    answer:'The available saved note says Juniper slept normally after the evening walk on November 2, 2025.',sources:['juniper-good']});
  assert.ok(promptHas(r,'juniper-good'));assert.ok(!promptHas(r,'juniper-deleted'));assert.doesNotMatch(r.serialized,/obsolete draft note/i);
});

test('9 four-pet latest-weight cohort does not leak selected-pet context',async t=>{
  const ids=['aster-weight-2026','fennel-weight','grove-weight','hazel-weight'];
  const r=await run(t,{q:'Give the latest recorded body weight for Aster, Fennel, Grove, and Hazel.',pet:'Aster',
    p:proposal({petNames:['Aster','Fennel','Grove','Hazel'],selection:'latest',terms:['weight']}),
    answer:'Aster is 20.9 kg, Fennel 8.2 kg, Grove 12.7 kg, and Hazel 4.4 kg in their latest matching weight records.',sources:ids});
  for(const id of ids)assert.ok(promptHas(r,id),id);
});

test('10 maximum 10-pet cohort preserves at least one owned history row per pet under dense noise',async t=>{
  const answer='Aster, Birch, Cedar, Dune, Echo, Fennel, Grove, Hazel, Indigo, and Juniper each have an owned historical record represented.';
  const r=await run(t,{q:'From 2022 through 2026, give one saved-history fact for each of my ten pets: Aster, Birch, Cedar, Dune, Echo, Fennel, Grove, Hazel, Indigo, and Juniper.',
    p:proposal({scope:'account',petNames:[],selection:'summary',terms:[],from:'2022-01-01',to:'2026-09-01'}),
    answer,sources:['aster-weight-2022','birch-food-old','cedar-med','dune-itch-2022','echo-owner-note','fennel-weight','grove-weight','hazel-weight','indigo-act-2022','juniper-good'],expectReview:2});
  const representedPets=new Set(r.prompt.contextRecords.filter(x=>x.sourceType==='care_update').map(x=>x.petId));
  assert.equal(representedPets.size,10);
  assert.equal(r.context.askHistory.coverage.perPet.length,10);
  assert.ok(r.context.askHistory.entries.length<=64);
});
