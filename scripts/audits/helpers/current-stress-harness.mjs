import {appendFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {exercise} from './lifetime-harness.mjs';
import {requestProposal} from './request-proposal.mjs';
// Frozen semantic dimensions only: no classifier over user wording, no fabricated certificates.
export function stressProposal(p={}) {
 const directions=p.selection==='latest'?['desc']:p.selection==='comparison'?['asc','desc']:[];
 const base=requestProposal({operation:'recall',subject:'explicit',petNames:[],topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'saved_history',...p},p.question||'Read the requested saved records.');
 return {...base,requirements:[],quantity:'records',operation:'recall',frame:null,evidenceNeeds:[],projection:null,
  readTicket:{operation:'read',subjectScope:p.scope||'named',
   temporal:{from:p.from?p.from+'T00:00:00Z':null,to:p.to?p.to+'T00:00:00Z':null,anchor:null,calendar:null},
   predicates:p.terms?.length?[{kind:'text_any',terms:p.terms}]:[],searchHints:[],probes:[],episode:null,
   selection:directions.length?{groupBy:['subject'],union:directions.map(direction=>({orderBy:[{field:'event_at',direction}],take:{count:1,per:'group'}}))}:null,
   outputs:{...(directions.length?{}:{strategy:null}),completeness:directions.length?'sufficient':'exhaustive',ordering:'asc',limit:null}}};
}
export async function stressExercise(question,options){
 const run=await exercise(question,{...options,history:true,expectedProviderCalls:0,expectedReviewCalls:0});
 if(process.env.FURVISE_STRESS_DIAGNOSTIC)appendFileSync(process.env.FURVISE_STRESS_DIAGNOSTIC,JSON.stringify({question,request:run.context.askInterpretation.request,subjects:run.context.askInterpretation.petIds,model:run.result.reasoning.model,records:run.result.reasoning.labsList?.records,coverage:run.context.askHistory?.coverage.ticketCoverage})+'\n');
 assert.equal(run.interpretationRequests.length,1,'exactly one mocked Brain proposal');
 assert.equal(run.requests.length,0,'no answer provider');assert.equal(run.reviewRequests.length,0,'no review provider');
 if(options.expectEmpty){assert.equal(run.context.askHistory.coverage.ticketCoverage.resultSet?.certified,true);assert.deepEqual(run.context.askHistory.coverage.ticketCoverage.resultSet.matchingIds,[]);assert.deepEqual(run.result.reasoning.relevantContextIds,[]);return run;}
 assert.equal(run.result.reasoning.model,'server-labs-list',JSON.stringify({model:run.result.reasoning.model,coverage:run.context.askHistory?.coverage.ticketCoverage}));
 assert.ok(run.result.reasoning.labsList,'real Labs certificate required');
 return run;
}
export const certifiedRows=run=>run.result.reasoning.labsList?.records||[];
export const evidenceIds=run=>new Set(certifiedRows(run).map(row=>row.sourceId));
export const hasEvidence=(run,id)=>evidenceIds(run).has('care:'+id);
export const visible=run=>JSON.stringify(run.result.reasoning.answer);
