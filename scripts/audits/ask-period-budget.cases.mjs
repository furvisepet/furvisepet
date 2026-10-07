import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {stressProposal} from './helpers/current-stress-harness.mjs';
import {datedSelectionProposal} from './helpers/dated-selection-fixture.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import {care,pets} from './fixtures/ask-lifetime-history.mjs';
const fixturePets=[{...pets[0],name:'Aster'}];
const id=(year,month)=>String(year)+'0000-0000-0000-0000-'+String(month).padStart(12,'0');
const makeRows=()=>[2021,2022,2023,2024].flatMap(year=>Array.from({length:12},(_,index)=>care(id(year,index+1),'milo',year+'-'+String(index+1).padStart(2,'0')+'-10','behavior','Aster explored the room and returned to the mat. This was an isolated observation; duration beyond the observation and the reason for the behavior were not recorded.')));
const historyAccess={months:60,from:'2021-01-01T00:00:00.000Z',to:'2026-06-06T00:00:00.000Z'};
test('broad-period omission prevents incomplete evidence from becoming a complete summary',async t=>{
 clock(t);const rows=makeRows(),question='Summarize observations recorded more than 2 years ago.';
 const r=await exercise(question,{fixturePets,messages:[],history:true,rows,historyAccess,
  interpretationProposal:stressProposal({question,petNames:['Aster'],terms:['observation'],from:'2021-01-01',to:'2024-09-04'})});
 assertSourceFreePublication(r);assert.notEqual(r.context.askHistory.coverage.ticketCoverage.status,'complete');
 assert.equal(r.context.askHistory.coverage.ticketCoverage.resultSet.certified,false);
 assert.ok(r.context.askHistory.entries.length<=32);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Aster explored|complete history/);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
});
test('bounded explicit year selections retain exact middle-period notes without increasing limits',async t=>{
 clock(t);const rows=makeRows(),question='Show Aster’s earliest recorded observation in each of 2021, 2022, 2023, and 2024.';
 const r=await exercise(question,{fixturePets,messages:[],history:true,rows,historyAccess,
  interpretationProposal:datedSelectionProposal({question,petNames:['Aster'],requests:[2021,2022,2023,2024].map(year=>({quote:String(year),from:year+'-01-01T00:00:00Z',to:(year+1)+'-01-01T00:00:00Z',terms:['observation']}))})});
 assert.equal(r.result.reasoning.model,'server-labs-list');const records=r.result.reasoning.labsList.records;
 assert.equal(records.length,4);assert.deepEqual(new Set(records.map(r=>r.sourceId)),new Set([2021,2022,2023,2024].map(year=>'care:'+id(year,1))));
 for(const record of records)assert.equal(record.body,rows.find(row=>'care:'+row.id===record.sourceId).note);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 for(const request of r.interpretationRequests)assert.ok(request.input.length<=48000);
});
