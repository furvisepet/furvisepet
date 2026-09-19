import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';
import { validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';

const names=['Aster','Bramble','Cedar','Dune','Echo'];
const ids=names.map(n=>n.toLowerCase());
function evidence(question, dates, rows, selectedIds=ids){
  const petNames=Object.fromEntries(ids.map((id,i)=>[id,names[i]]));
  const e={version:'ask-evidence.v1',timeZone:'UTC',
    scope:{authorizedPetIds:[...selectedIds],requestedTopic:'history',requestText:question,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',readOnlyRecall:true,status:'resolved',resolutionSubject:'pets'},
    sources:selectedIds.map(id=>({petId:id,source:'care_entries',status:'loaded',loadedIds:[],loadedCount:0,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}})),
    completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],represented:[],representation:'complete',verifiedFacts:[],petNames,
    interpretation:{operation:'comparison',readOnly:true,petIds:[...selectedIds],readPetIds:true,conversationOnly:false,request:{version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],quantity:null,evidenceBasis:'saved_history',outputFormat:'prose',premiseQuotes:[],excludedPetNames:[],projection:null,evidenceNeeds:[],scope:selectedIds.length>1?'account':'selected',operation:'comparison',selection:'comparison',frame:null}},
    history:{plan:{from:null,to:null,terms:[],interpretation:'period'},candidateIds:[],queryCount:0,retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete',continuation:[],reasons:[],consistency:'read_committed_no_snapshot',perPet:[],provenance:[],claimSources:[],excludedIds:[],needs:[],targets:[],endpointPairs:[],requiredSourceIds:[]}};
  selectedIds.forEach(id=>{const i=ids.indexOf(id);dates.forEach((date,j)=>{
    const raw=rows[j][i], text=typeof raw==='string'?raw:`${names[i]} weighed ${raw} kg.`;
    const sourceId=`care:${id}:${date}`;
    e.represented.push({sourceId,petId:id,sourceType:'care_update',field:'value',start:0,end:text.length,text,occurredAt:date+'T12:00:00Z'});
    const s=e.sources.find(x=>x.petId===id);s.loadedIds.push(sourceId);s.loadedCount++;
  })}); return e;
}
test('complex Q1 filters under-7kg cohort and preserves exact weights even with table output hint',()=>{
  const q='On September 15, 2026, which pets weighed under 7 kg, and what were their exact weights?';
  const e=evidence(q,['2026-09-15'],[[30.31,4.71,14.51,6.61,7.01]]);e.interpretation.request.outputFormat='table';
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Bramble 4\.71 kg/);assert.match(t,/Dune 6\.61 kg/);assert.doesNotMatch(t,/Echo|Cedar|Aster/);
});
test('complex Q2 computes two-pet two-date gains and gap',()=>{
  const q="Compare Aster's and Cedar's weights from January 15, 2024 to September 15, 2026. How much did each gain, and whose gain was larger by how much?";
  const e=evidence(q,['2024-01-15','2026-09-15'],[[28.63,0,13.61,0,0],[30.31,0,14.51,0,0]],['aster','cedar']);
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Aster gained 1\.68 kg/);assert.match(t,/Cedar gained 0\.9 kg/);assert.match(t,/Aster gained 0\.78 kg more/);assert.doesNotMatch(t,/—|changed \+/);
});
test('complex Q6 filters cohort by two-date gain threshold',()=>{
  const q='Between September 15, 2024 and September 15, 2026, which of the five pets gained at least 1 kg?';
  const e=evidence(q,['2024-09-15','2026-09-15'],[[29.10,4.61,13.88,6.37,6.75],[30.31,4.71,14.51,6.61,7.01]]);
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Aster gained 1\.21 kg from Sep 15, 2024 to Sep 15, 2026/);assert.doesNotMatch(t,/Bramble|Cedar|Dune|Echo|—/);
});
test('complex Q7 returns source details instead of generic matched-detail copy',()=>{
  const q='At the September 15, 2023 records, which pet had a dental cleaning, what food was used that evening, and what was resumed the next day?';
  const rows=names.map((name,i)=>i===4
    ? 'Echo weighed 6.62 kg. Routine dental cleaning was completed. Soft food was used that evening and normal kibble resumed the next day.'
    : name+' weighed '+[28.49,4.56,13.57,6.25,6.62][i]+' kg. Monthly care check recorded stable appetite.');
  const e=evidence(q,['2023-09-15'],[rows]);e.interpretation.request.evidenceNeeds=[{id:'n',quote:q,sourceTurnId:null,terms:['dental cleaning'],order:'context'}];
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Echo/);assert.match(t,/Soft food/);assert.match(t,/normal kibble resumed/);
});
test('complex Q9 finds largest absolute increase across five pets',()=>{
  const q='Across all five pets, compare their January 15, 2024 wellness weights with January 15, 2026. Which pet had the largest absolute increase, and what was the increase?';
  const e=evidence(q,['2024-01-15','2026-01-15'],[[28.63,4.50,13.61,6.22,6.59],[30.05,4.82,14.44,6.67,7.06]]);
  const p=deterministicReadProjection(e);assert.ok(p);assert.match(p.sentences[0].text,/Aster had the largest absolute increase, gaining 1\.42 kg/);assert.match(p.sentences[0].text,/Jan 15, 2024/);assert.doesNotMatch(p.sentences[0].text,/—|\+1\.42/);
});
test('complex Q10 resolves descriptor pet from earlier dated evidence and computes later change',()=>{
  const q='For that 2023 dental-cleaning pet, what was the weight on September 15, 2026, and how much higher was it than on September 15, 2023?';
  const early=names.map((name,i)=>i===4?'Echo weighed 6.62 kg. Routine dental cleaning was completed. Soft food was used that evening and normal kibble resumed the next day.':name+' weighed '+[28.49,4.56,13.57,6.25,6.62][i]+' kg. Routine note.');
  const e=evidence(q,['2023-09-15','2026-09-15'],[early,[30.31,4.71,14.51,6.61,7.01]]);
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Echo weighed 7\.01 kg/);assert.match(t,/0\.39 kg higher/);
});
test('descriptor follow-up widens read scope to owned account instead of selected pet',()=>{
  const pets=ids.map((id,i)=>({id,user_id:'owner',name:names[i]}));
  const current='For that 2023 dental-cleaning pet, what was the weight on September 15, 2026, and how much higher was it than on September 15, 2023?';
  const proposal={version:'ask-request.v2',mode:'read',question:current,requirements:[],referenceTurnIds:[],scope:'selected',petNames:[],operation:'comparison',selection:'comparison',quantity:null,topic:'weight',terms:['weight'],from:'2023-09-15',to:'2026-09-16',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
  const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:current,conversationTurns:[{id:'u1',role:'user',text:'At the September 15, 2023 records, which pet had a dental cleaning, what food was used that evening, and what was resumed the next day?'}]});
  assert.deepEqual(new Set(result.petIds),new Set(ids));
});

test('planner cannot invent table output when user asked only for exact weights',()=>{
  const pets=ids.map((id,i)=>({id,user_id:'owner',name:names[i]}));
  const current='On September 15, 2026, which pets weighed under 7 kg, and what were their exact weights?';
  const proposal={version:'ask-request.v2',mode:'read',question:current,requirements:[],referenceTurnIds:[],scope:'account',petNames:[],operation:'comparison',selection:'period',quantity:null,topic:'weight',terms:['weight'],from:'2026-09-15',to:'2026-09-16',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',outputFormat:'table'};
  const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:current,conversationTurns:[]});
  assert.equal(result.request.outputFormat,null);
});
test('complex Q4 preserves event context instead of substituting record timestamp',()=>{
  const q='Which pet had mild stiffness recorded on November 15, 2024, when did it happen, and what made it improve?';
  const weights=[29.27,4.69,14.01,6.46,6.84];
  const rows=names.map((name,i)=>i===0
    ? 'Aster weighed 29.27 kg. Mild stiffness was noticed after long rests, improving after a few minutes of walking. Daily activity otherwise remained steady.'
    : name+' weighed '+weights[i]+' kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.');
  const e=evidence(q,['2024-11-15'],[rows]);e.interpretation.request.evidenceNeeds=[{id:'n',quote:q,sourceTurnId:null,terms:['mild stiffness','improve'],order:'context'}];
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences[0].text;
  assert.match(t,/Aster/);assert.match(t,/after long rests/);assert.match(t,/after a few minutes of walking/);
});

test('thin-file food comparison still returns the one saved food note instead of a generic partial',()=>{
  const q="Bramble's on a different food than last month right? What did I write down?";
  const rows=[[0,'Bramble weighed 4.77 kg. Routine dental cleaning was completed. Eating returned to the normal turkey wet-food routine the following day.',0,0,0]];
  const e=evidence(q,['2025-06-15'],rows,['bramble']);
  e.interpretation.operation='recall';e.interpretation.request.operation='recall';e.interpretation.request.selection='summary';
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences.map(s=>s.text).join(' ');
  assert.match(t,/food note I found for Bramble is from Jun 15, 2025/i);
  assert.match(t,/turkey wet-food routine/i);
  assert.match(t,/can't confirm a food switch from last month/i);
  assert.doesNotMatch(t,/Partial answer|couldn.t complete every part/i);
});

test('food recall with several historical notes uses the latest relevant note and names a missing prior-month comparison',()=>{
  const q="Bramble's on a different food than last month right? What did I write down?";
  const e=evidence(q,['2025-06-15','2025-12-15','2026-06-15'],[
    [0,'Bramble weighed 4.75 kg. Dental cleaning was completed. Eating returned to the normal turkey wet-food routine the following day.',0,0,0],
    [0,'Bramble weighed 4.78 kg. Nutrition review: the usual measured diet was continued and appetite was normal.',0,0,0],
    [0,'Bramble weighed 4.80 kg. Monthly nutrition review: the usual measured diet was continued, appetite was normal, and no persistent digestive change was reported.',0,0,0],
  ],['bramble']);
  e.interpretation.operation='recall';e.interpretation.request.operation='recall';e.interpretation.request.selection='summary';
  const p=deterministicReadProjection(e);assert.ok(p);const t=p.sentences.map(s=>s.text).join(' ');
  assert.match(t,/latest food note I found for Bramble is from Jun 15, 2026/i);
  assert.match(t,/usual measured diet was continued/i);
  assert.match(t,/I don't see a food note for Bramble from .*can't confirm a food switch from last month/i);
  assert.doesNotMatch(t,/turkey wet-food routine|Partial answer|couldn.t complete every part/i);
});

test('V1 pre-vet read compiles recent change and requested vet questions from grounded notes',()=>{
  const q="I have a checkup for Aster on Friday. From my notes, what changed since the last visit, and give me 3 questions for the vet. Don't diagnose.";
  const e=evidence(q,['2026-01-15','2026-09-18'],[
    ['Aster weighed 30.05 kg. Annual wellness visit recorded stable appetite, normal activity for age, and no new ongoing concern.',0,0,0,0],
    ['Aster skipped breakfast but ate dinner fine. A bit slower on the evening walk.',0,0,0,0],
  ],['aster']);
  e.interpretation.operation='overview';
  e.interpretation.request.operation='overview';
  e.interpretation.request.selection='summary';
  e.interpretation.request.temporalScope='historical_and_current';
  e.recordTitles={'care:aster:2026-01-15':'Annual wellness visit'};
  const p=deterministicReadProjection(e);assert.ok(p);
  const t=p.sentences.map(s=>s.text).join('\n');
  assert.match(t,/last recorded visit I found is from Jan 15, 2026/i);
  assert.match(t,/skipped breakfast but ate dinner fine/i);
  assert.match(t,/slower on the evening walk/i);
  assert.match(t,/Questions for the vet:/);
  assert.equal(p.sentences.filter(s=>/^\d+\./.test(s.text)).length,3);
  assert.doesNotMatch(t,/diagnos|2018/);
});

test('V1 pre-vet deterministic read declines urgent latest history',()=>{
  const q="I have a checkup for Aster on Friday. From my notes, what changed since the last visit, and give me 3 questions for the vet. Don't diagnose.";
  const e=evidence(q,['2026-01-15','2026-09-18'],[
    ['Aster weighed 30.05 kg. Annual wellness visit recorded stable appetite and normal activity.',0,0,0,0],
    ['Aster had difficulty breathing and collapsed.',0,0,0,0],
  ],['aster']);
  e.interpretation.operation='overview';e.interpretation.request.operation='overview';e.interpretation.request.selection='summary';
  e.interpretation.request.temporalScope='historical_and_current';e.recordTitles={'care:aster:2026-01-15':'Annual wellness visit'};
  assert.equal(deterministicReadProjection(e),null);
});

test('since-dental food read keeps the anchor row and later food notes',()=>{
  const q="Since Bramble's dental, what did I write about eating or food? Don't guess months I didn't log.";
  const row1=names.map((name,i)=>i===1
    ? 'Bramble weighed 4.75 kg. Dental cleaning was completed at the routine clinic visit. Eating returned to the normal turkey wet-food routine the following day.'
    : name+' weighed 1 kg. Routine note.');
  const row2=names.map((name,i)=>i===1
    ? 'Bramble weighed 4.80 kg. Monthly nutrition review: the usual measured diet was continued, appetite was normal, and no persistent digestive change was reported.'
    : name+' weighed 1 kg. Routine note.');
  const e=evidence(q,['2025-06-15','2026-06-15'],[row1,row2],['bramble']);
  e.interpretation.operation='recall';e.interpretation.request.operation='recall';e.interpretation.request.selection='summary';
  const p=deterministicReadProjection(e);assert.ok(p);
  const text=p.sentences.map(s=>s.text).join('\n');
  assert.match(text,/dental note on Jun 15, 2025 as the starting point/i);
  assert.match(text,/turkey wet-food routine/i);
  assert.match(text,/Jun 15, 2026/);
  assert.match(text,/usual measured diet was continued/i);
});

test('mixed save companion returns the last two weights and checks the saved note independently',()=>{
  const q="tell me Cedar's last two recorded weights and whether this note includes a weight.";
  const e=evidence(q,['2026-08-15','2026-09-15'],[
    [0,0,14.66,0,0],
    [0,0,14.51,0,0],
  ],['cedar']);
  const noteId='care:cedar:just-saved';
  const noteText='Cedar ate less this morning.';
  e.represented.push({sourceId:noteId,petId:'cedar',sourceType:'care_update',field:'value',start:0,end:noteText.length,text:noteText,occurredAt:'2026-09-18T12:00:00Z'});
  e.sources[0].loadedIds.push(noteId);e.sources[0].loadedCount++;
  e.completedOwnerNote={sourceMessageId:'turn',petId:'cedar',entryIds:['cedar:just-saved'],note:noteText};
  e.interpretation.operation='recall';e.interpretation.request.operation='recall';e.interpretation.request.selection='latest';e.interpretation.request.quantity='measurement';
  const p=deterministicReadProjection(e);assert.ok(p);
  const text=p.sentences.map(s=>s.text).join('\n');
  assert.match(text,/Cedar's two latest recorded weights are:/);
  assert.match(text,/Sep 15, 2026: 14\.51 kg/);
  assert.match(text,/Aug 15, 2026: 14\.66 kg/);
  assert.match(text,/note you just saved does not include a weight/i);
  assert.doesNotMatch(text,/food or life-status change/i);
});

test("single latest weight uses latest saved care-history source only",()=>{
  const q="Look at Dune's latest weight.";
  const e=evidence(q,['2026-08-15','2026-09-15'],[
    [0,0,0,6.77,0],
    [0,0,0,6.61,0],
  ],['dune']);
  e.interpretation.operation='recall';e.interpretation.request.operation='recall';e.interpretation.request.selection='latest';
  e.scope.requestedTopic='weight';
  const p=deterministicReadProjection(e);assert.ok(p);
  const text=p.sentences.map(s=>s.text).join('\n');
  assert.match(text,/Dune's latest recorded weight is 6\.61 kg from Sep 15, 2026/);
  assert.doesNotMatch(text,/6\.7 kg/);
});
