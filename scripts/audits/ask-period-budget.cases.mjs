import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {care,pets} from './fixtures/ask-lifetime-history.mjs';
const fixturePets=[{...pets[0],name:'Aster'}];
const id=(year,month)=>`${year}0000-0000-0000-0000-${String(month).padStart(12,'0')}`;
test('broad-period query metadata does not displace all middle-period notes',async t=>{
 clock(t);
 const rows=[2021,2022,2023,2024].flatMap(year=>Array.from({length:12},(_,index)=>care(id(year,index+1),'milo',`${year}-${String(index+1).padStart(2,'0')}-10`,'behavior','Aster explored the room and returned to the mat. This was an isolated observation; duration beyond the observation and the reason for the behavior were not recorded.')));
 const question='Summarize observations recorded more than 2 years ago.';
 const r=await exercise(question,{fixturePets,messages:[],history:true,rows,
  historyAccess:{months:60,from:'2021-01-01T00:00:00.000Z',to:'2026-06-06T00:00:00.000Z'},
  interpretationProposal:{version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'overview',selection:'summary',quantity:null,topic:'observations',terms:['observations'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',evidenceNeeds:[{id:'need:0',sourceTurnId:null,quote:'observations recorded more than 2 years ago',terms:['observation'],petNames:['Aster'],order:'context'}]},
  providerOverrides:{answer:'Aster explored the room and returned to the mat.',historyNarrative:{sentences:[{text:'Aster explored the room and returned to the mat.',sourceIds:[`care:${id(2021,1)}`]}]}},reviewResponse:{approved:true},expectedReviewCalls:1});
 const records=r.prompt.contextRecords.filter(record=>record.sourceType==='care_update');
 t.diagnostic(JSON.stringify({records:records.length,years:[...new Set(records.map(record=>record.occurredAt.slice(0,4)))],inputChars:r.serialized.length}));
 assert.ok(records.length>=22);
 for (const record of records) {
  const row=rows.find(row=>`care:${row.id}`===record.id);
  const span=r.prompt.evidenceContract.represented.find(span=>span.sourceId===record.id);
  assert.ok(row && span?.text.includes(row.note),'represented owner text remains complete');
 }
 assert.ok(new Set(records.map(record=>record.occurredAt.slice(0,4))).size===4);
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.ok(r.context.askHistory.coverage.candidateIds.length>records.length);
});
