import assert from 'node:assert/strict';
import test from 'node:test';
import {clock} from '../scripts/audits/helpers/lifetime-harness.mjs';
import {stressExercise,stressProposal,certifiedRows} from '../scripts/audits/helpers/current-stress-harness.mjs';
import {care,pets} from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
for(const [topic,date] of [['volume','2023-04-12'],['duration','2024-11-03'],['length','2025-06-19']])test('concrete '+topic+' window does not spend selection budget on out-of-window history',async t=>{
 clock(t);const subjects=pets.slice(0,3).map((p,i)=>({...p,name:'Subject '+i}));
 const rows=subjects.flatMap(p=>[
  ...Array.from({length:120},(_,i)=>care(p.id+'-noise-'+i,p.id,'2021-01-01','general','Unrelated observation '+i)),
  care(p.id+'-target',p.id,date,'general',topic+' recorded 8'),
 ]);
 const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const run=await stressExercise('Compare the recorded '+topic+' for each subject on '+date+'.',{
  fixturePets:subjects,petId:subjects[0].id,rows,messages:[],interpretationProposal:stressProposal({petNames:subjects.map(p=>p.name),terms:[topic],selection:'comparison',from:date,to:next})});
 assert.deepEqual(new Set(certifiedRows(run).map(row=>row.id)),new Set(subjects.map(p=>p.id+'-target')));
 assert.ok(run.context.askHistory.coverage.ticketCoverage.groups.every(g=>g.clauses.every(c=>c.certified)));
});

test('out-of-window store rows cannot manufacture a directional certificate',async()=>{
 const {validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
 const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
 const p=stressProposal({petNames:['Subject'],terms:[],selection:'latest',from:'2024-01-02',to:'2024-01-03'});
 const subject={...pets[0],id:'milo',name:'Subject'};
 const ticket=validateAskRequest(p,{owner:{userId:'synthetic-owner'},pet:subject,eligiblePets:[subject],currentMessage:p.question,conversationTurns:[]}).request.readTicket;
 for(const date of ['2024-01-01','2024-01-03']){
  let closureCalls=0;
  const result=await retrieveReadTicket(ticket,{userId:'synthetic-owner',ownedPetIds:['milo'],from:'2000-01-01T00:00:00Z',to:'2026-01-01T00:00:00Z',asOf:'2026-01-01T00:00:00Z'},
   {page:async()=>[care('outside','milo',date,'general','Observation')],effective:async()=>{throw Error('unexpected');},effectiveWindow:async()=>{closureCalls++;throw Error('outside row reached closure');}});
  assert.equal(closureCalls,0);assert.deepEqual(result.records,[]);assert.ok(result.coverage.reasons.includes('invalid_directional_page'));
 }
});
