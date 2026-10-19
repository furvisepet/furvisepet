import * as C from './helpers/calculation-public-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import { clock, exercise } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { pets as templates, ownerId } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
import { stressProposal } from '../scripts/audits/helpers/current-stress-harness.mjs';
import { readTicketProviderSchema } from '../app/lib/furvise-brain/read-ticket-provider-schema.ts';
import { compileTicket } from '../app/lib/intelligence/ask-wire-read-ticket.mjs';
import { makeValidator } from '../app/lib/intelligence/ask-wire-codec.mjs';
import { labsListReviewFailure } from '../app/lib/intelligence/labs-list.ts';
import { selectionPublication } from '../app/lib/intelligence/selection-publication.ts';

const pets = ['Quartz', 'Nyx'].map((name,i)=>({...templates[i],id:'reported-anchor-'+i,name,user_id:ownerId}));
const row = (id, note, day, petId=pets[0].id, year=2024) => ({
 ...C.row(id,note,day,petId), user_id:ownerId,
 occurred_at:new Date(Date.UTC(year,0,day)).toISOString(),
 created_at:new Date(Date.UTC(year,0,day)).toISOString(),
 updated_at:new Date(Date.UTC(year,0,day)).toISOString()
});
const rows = () => [
 row('earlier-anchor','2023 routine examination: length 18 cm',2,pets[0].id,2023),
 row('anchor','2024 routine examination: length 21 cm',2),
 row('after','Recorded length 22 cm',5),
 row('later','Recorded length 24 cm',8)
];
const question = 'What was the first recorded length after the 2024 routine examination, excluding its measurement?';
const unclassified = {claims:[],sources:[],targets:[],complete:false,limit:76};
function proposal(authority='stored_report',relation='after') {
 const p=stressProposal({authority,selection:'summary',petNames:[pets[0].name],from:'2024-01-01',to:'2025-01-01'});
 p.quantity='measurement';
 p.readTicket={authority,operation:'read_since_event',subjectScope:'named',
  temporal:{from:'2024-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z',anchor:{concept:'2024 routine examination',relation},calendar:null},
  predicates:[{kind:'text_any',terms:['length']}],searchHints:null,episode:null,probes:[],
  selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'asc'}],take:{count:1,per:'group'}}]},
  outputs:{completeness:'sufficient',ordering:'asc',limit:null}};
 return p;
}
const bind=value=>{const {probes,...rest}=value;assert.deepEqual(probes,[]);return C.bindTypedReadTicket(rest,[pets[0].id]);};
async function journey(t,{p=proposal(),data=rows(),graph={},...options}={}) {
 clock(t);
 const result=await exercise(question,{fixturePets:pets,petId:pets[1].id,conversationPetId:pets[1].id,
  rows:data,messages:[],history:true,interpretationProposal:p,interpretationModel:'gpt-5.4',
  expectedProviderCalls:0,expectedReviewCalls:0,graph:{sourceSemanticsPage:unclassified,...graph},...options});
 assert.equal(result.interpretationRequests.length,1);
 assert.equal(result.requests.length,0);assert.equal(result.reviewRequests.length,0);
 assert.deepEqual(result.result.acceptedCareActions,[]);assert.deepEqual(result.result.acceptedSemanticEvents,[]);
 return result;
}
test('explicit reported anchor is typed and lossless; unknown tags and extra fields reject',()=>{
 const input=proposal().readTicket, schemaCheck=new Ajv({allErrors:true}).compile(readTicketProviderSchema);
 assert.equal(schemaCheck(input),true,JSON.stringify(schemaCheck.errors));
 const sources=readTicketProviderSchema.anyOf.filter(s=>makeValidator(s)(s,input));
 assert.equal(sources.length,1);
 const codec=compileTicket(sources[0],'reported_anchor_test','UTC'),wire=codec.encode(input);
 assert.deepEqual(codec.decode(wire),input);assert.deepEqual(bind(input).temporal,input.temporal);
 assert.equal(bind(input).authority,'stored_report');
 assert.throws(()=>codec.decode({...wire,ticketBranch:'unknown'}));
 assert.throws(()=>codec.decode({...wire,inventedAuthority:true}));
 for(const patch of [
  {operation:'read'}, {episode:{operation:'membership',referent:null}},
  {temporal:{...input.temporal,calendar:'oldest_year'}},
  {outputs:{...input.outputs,strategy:'chronological'}},
  {attributedContexts:[{recorded:{from:'2025-01-01T00:00:00Z',to:'2025-02-01T00:00:00Z'},target:{from:'2024-01-01T00:00:00Z',to:'2024-02-01T00:00:00Z'}}]}
 ]) {const value={...input,...patch};assert.equal(schemaCheck(value),false);assert.throws(()=>bind(value));}
});
test('actual application publishes first reported record after unique qualified anchor, excluding visit measurement',async t=>{
 const r=await journey(t),labs=r.result.reasoning.labsList;
 assert.ok(labs,'report publication must be reached');assert.equal(labs.ticket.authority,'stored_report');
 assert.equal(labs.ticket.operation,'read_since_event');assert.equal(labs.ticket.temporal.anchor.concept,'2024 routine examination');
 assert.deepEqual(labs.records.map(x=>x.id),['after']);
 assert.deepEqual(labs.coverage.anchors,[{petId:pets[0].id,eventId:'anchor',eventAt:rows()[1].occurred_at}]);
 assert.ok(labs.coverage.effectiveStream.every(x=>x.storedReportsCertified===true && x.lineageClosed===false));
 assert.equal(selectionPublication(labs.ticket,labs.coverage,labs.records).complete,true);
 assert.equal(labsListReviewFailure(r.result.reasoning),null);
 assert.match(r.result.reasoning.answer.summary,/22 cm/);assert.doesNotMatch(r.result.reasoning.answer.summary,/21 cm|24 cm|18 cm/);
 assert.match(r.result.reasoning.answer.summary,/Stored reports only/);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 const request=r.interpretationRequests[0],size=JSON.stringify(request).length;
 assert.ok(size<=135000,'actual complete request '+size);
 assert.equal(request.model,'gpt-5.4');assert.equal(request.reasoning.effort,'none');
 const schema=request.text.format.schema,defs=schema.$defs||{};
 const depth=(s,seen=new Set())=>{
  if(!s||typeof s!=='object')return 0;
  if(s.$ref){const key=s.$ref.slice(8);assert.ok(!seen.has(key),'nonrecursive provider schema');return depth(defs[key],new Set([...seen,key]));}
  const nested=Math.max(0,...Object.values(s.properties||{}).map(v=>depth(v,seen)),...(s.items?[depth(s.items,seen)]:[]),...(s.anyOf||[]).map(v=>depth(v,seen)));
  const types=Array.isArray(s.type)?s.type:[s.type];
  return nested+(types.some(v=>v==='object'||v==='array')?1:0);
 };
 assert.ok(depth(schema)<=10,'actual schema depth '+depth(schema));

 console.log('REPORTED_ANCHOR_REQUEST_METRICS '+JSON.stringify({chars:size,estimated:Math.ceil(size/3),n:1,model:request.model,reasoning:request.reasoning.effort}));
});
test('retained effective-fact authority remains rejected with missing persisted classification; no fallback',async t=>{
 const r=await journey(t,{p:proposal('effective_fact')});
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.equal(r.context.askInterpretation.request.readTicket.authority,'effective_fact');
 assert.ok(r.context.askHistory.coverage.reasons.includes('source_semantics_incomplete'));
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
for(const [name,change] of [
 ['missing anchor',p=>{p.readTicket.temporal.anchor.concept='missing examination';}],
 ['unqualified recurring anchor',p=>{p.readTicket.temporal.anchor.concept='routine examination';}],
])test(name+' cannot publish a selected report',async t=>{
 const p=proposal();change(p);const r=await journey(t,{p});
 assert.notEqual(r.result.answerValidation.assessment.outcome,'complete');
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
for(const [name,options]of[
 ['graph failure',{failGraph:true}],
 ['changed source',{graph:{sources:[{...rows()[1],note:'Changed source after candidate read'}]}}],
 ['missing source',{graph:{missingSourceIds:['anchor']}}],
 ['truncated correction graph',{graph:{truncated:true}}]
])test('reported anchor preserves '+name+' rejection',async t=>{
 const r=await journey(t,options);assert.notEqual(r.result.answerValidation.assessment.outcome,'complete');assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
test('same-time measurements are excluded by strict after and before/from retain original semantics',async()=>{
 const data=[row('anchor','2024 routine examination length 21 cm',2),row('same','Recorded length 21.1 cm',2),row('next','Recorded length 22 cm',5)];
 for(const [relation,ids]of [['after',['next']],['from',['anchor']]]) {
  const ticket=bind(proposal('stored_report',relation).readTicket);
  const r=await C.retrieveReadTicket(ticket,{userId:ownerId,ownedPetIds:[pets[0].id],from:'2020-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z',asOf:'2025-01-01T00:00:00Z'},{
   page:async q=>data.filter(x=>x.occurred_at>=q.from&&x.occurred_at<q.to).slice(q.offset,q.offset+q.limit),
   effective:async()=>{throw Error('legacy reliable cannot supply report authority');},
   effectiveWindow:async({rows})=>({records:rows,lineageClosed:false,replacementSeedsExhausted:true,sourceLineage:[],storedReportsCertified:true,reasons:[],graphCalls:1,lineageRows:rows.length})
  });
  assert.deepEqual(r.records.map(x=>x.id),ids);assert.equal(selectionPublication(ticket,r.coverage,r.records.map(x=>({id:x.id,petId:x.pet_profile_id}))).complete,true);
 }
});
test('a reliable=true or factual-only store cannot mint reported anchor authority',async()=>{
 const ticket=bind(proposal().readTicket),data=rows();
 const scope={userId:ownerId,ownedPetIds:[pets[0].id],from:'2020-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z',asOf:'2025-01-01T00:00:00Z'};
 for(const effectiveWindow of [undefined,async({rows})=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],reasons:[],graphCalls:1,lineageRows:rows.length})]) {
  const r=await C.retrieveReadTicket(ticket,scope,{page:async q=>data.slice(q.offset,q.offset+q.limit),effective:async records=>({records,reliable:true}),effectiveWindow});
  assert.equal(r.coverage.status,'unavailable');assert.deepEqual(r.records,[]);
 }
});
test('report anchors do not widen scope or authorize calculations',async()=>{
 const input=proposal().readTicket,ticket=bind(input),scope={userId:ownerId,ownedPetIds:[pets[1].id],from:'2020-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z',asOf:'2025-01-01T00:00:00Z'};
 let reads=0;const r=await C.retrieveReadTicket(ticket,scope,{page:async()=>{reads++;return[];},effective:async()=>{reads++;return{records:[],reliable:true};}});
 assert.equal(reads,0);assert.deepEqual(r.records,[]);assert.ok(r.coverage.reasons.includes('subject_not_authorized'));
 const plan=C.calculation('count_records',[],'records');assert.throws(()=>C.bindCalculatePlan({operation:'calculate',calculations:[plan]},ticket,pets));
});
