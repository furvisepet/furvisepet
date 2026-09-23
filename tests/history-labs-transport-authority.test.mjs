import assert from "node:assert/strict";
import test from "node:test";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c);}});
const {bindCompositionalReadTicket}=await import("../app/lib/furvise-brain/read-selection.ts");
const {retrieveReadTicket}=await import("../app/lib/furvise-brain/lungs.ts");
const {buildLabsList,serializeLabsList}=await import("../app/lib/intelligence/labs-list.ts");
const {historyLabsAuthorityFailure}=await import("../app/lib/intelligence/ordinary-history-publication.ts");
const {derivePublicationAuthority,publicationSources}=await import("../app/lib/intelligence/publication-authority.ts");
const {reviewHistoricalAnswer}=await import("../app/lib/intelligence/review-history-narrative.ts");
const {validateGeneratedAnswer}=await import("../app/lib/intelligence/validation/validate-answer.ts");
const noProvider={responses:{create:async()=>{throw Error("no publication provider");}}};
async function fixture({resultSet=false,empty=false,mixed=false}={}){
 const petIds=mixed?["owned-a","owned-b"]:["owned-a"];
 let ticket=bindCompositionalReadTicket({operation:"read",subjectScope:"named",needs:[],episode:null,
  temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[],
  selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"asc"}],take:{count:1,per:"group"}}]},
  outputs:{completeness:resultSet?"exhaustive":"sufficient",ordering:"asc",limit:null}},petIds);
 if(resultSet){ticket=structuredClone(ticket);delete ticket.selection;}
 const rows=empty?[]:petIds.map((petId,i)=>({id:"record-"+i,user_id:"owner",pet_profile_id:petId,
  category:"general",title:null,note:"Observation "+i+" recorded.",deleted_at:null,
  occurred_at:"2020-01-01T00:00:00Z",created_at:"2020-01-01T00:00:00Z"}));
 const read=await retrieveReadTicket(ticket,{userId:"owner",ownedPetIds:petIds,
  from:"2010-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-09-22T00:00:00Z"},{
  page:async({petId,offset,limit})=>rows.filter(r=>r.pet_profile_id===petId).slice(offset,offset+limit),
  effective:async rows=>({records:rows,reliable:true}),
  effectiveWindow:async({petId,rows})=>({records:rows,lineageClosed:petId!=="owned-b",replacementSeedsExhausted:petId!=="owned-b",
   sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
 const evidence={version:"ask-evidence.v1",petNames:{"owned-a":"Alpha","owned-b":"Beta"},
  scope:{authorizedPetIds:petIds,requestText:"typed record lookup",status:"resolved",readOnlyRecall:true,requestKind:"record_lookup"},
  interpretation:{operation:"recall",readOperation:"recall",readOnly:true,petIds,request:{mode:"read",
   evidenceBasis:"saved_history",quantity:"records",readTicket:ticket}},
  history:{ticketCoverage:read.coverage,provenance:[],reasons:[],needs:[]},sources:[],represented:[],losses:[]};
 const labs=buildLabsList(evidence,read.records);assert.ok(labs);
 const result={labsList:labs,evidenceContract:evidence,answer:{title:"Furvise",summary:serializeLabsList(labs),sections:[],safetyNote:null},
  relevantContextIds:labs.records.map(r=>r.sourceId),applicationActions:[],careActions:[],semanticEvents:[],learnings:[],
  proposedHistoryUpdate:{shouldOffer:false},safetyLevel:"normal",responseMode:"practical_guidance",suggestedFollowUps:[]};
 return {result,evidence,petIds,context:{currentMessage:"typed record lookup",pet:{id:petIds[0]},eligiblePets:petIds.map(id=>({id,user_id:"owner"})),careEntries:read.records,memories:[]}};
}
for(const resultSet of [false,true])test((resultSet?"result-set":"selection")+" Labs needs no model representation",async()=>{
 const f=await fixture({resultSet});assert.deepEqual(f.evidence.sources,[]);assert.deepEqual(f.evidence.represented,[]);
 assert.equal(historyLabsAuthorityFailure(f.result),null);
 const a=derivePublicationAuthority(f.evidence,f.result.labsList.records);assert.equal(a.transportValid,true);
 assert.deepEqual(a.authorizedSourceIds,f.result.relevantContextIds);
 assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
 assert.equal(validateGeneratedAnswer(f.result,f.context,"normal",f.petIds).valid,true);
});
test("both certified empty transports remain factual empty results",async()=>{
 for(const resultSet of [false,true]){
  const f=await fixture({resultSet,empty:true});
  assert.equal(historyLabsAuthorityFailure(f.result),null);
  const a=derivePublicationAuthority(f.evidence,f.result.labsList.records);
  assert.ok(a.obligations.every(o=>o.authority==="certified"&&o.status==="complete_empty"));
  assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
  assert.equal(validateGeneratedAnswer(f.result,f.context,"normal",f.petIds).assessment.outcome,"complete");
 }
});
test("missing or injected Labs rows fail closed for both receipt kinds",async()=>{
 for(const resultSet of [false,true])for(const change of [
  r=>r.labsList.records.pop(),r=>r.labsList.records.push({...r.labsList.records[0],id:"extra",sourceId:"care:extra"})
 ]){
  const f=await fixture({resultSet});change(f.result);
  assert.ok(historyLabsAuthorityFailure(f.result));
  assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),false);
 }
});
test("subject, date, body and source ID drift fail existing snapshot checks",async()=>{
 for(const field of ["petId","event_at","body","sourceId"]){
  const f=await fixture();f.result.labsList.records[0][field]="changed";
  assert.ok(historyLabsAuthorityFailure(f.result));
 }
});
test("mixed transport publishes only certified rows and a scoped limitation",async()=>{
 const f=await fixture({mixed:true});assert.equal(historyLabsAuthorityFailure(f.result),null);
 assert.deepEqual(f.result.labsList.records.map(r=>r.petId),["owned-a"]);
 assert.match(f.result.answer.summary,/Beta/);assert.doesNotMatch(f.result.answer.summary,/Observation 1/);
 assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
 assert.equal(validateGeneratedAnswer(f.result,f.context,"normal",f.petIds).assessment.outcome,"limited");
});
test("raw transport and model spans cannot create authority without organ receipts",async()=>{
 const f=await fixture(),rows=f.result.labsList.records;delete f.evidence.history.ticketCoverage;
 f.evidence.sources=[{petId:"owned-a",source:"care_entries",status:"loaded",loadedIds:rows.map(r=>r.sourceId)}];
 f.evidence.represented=rows.map(r=>({sourceId:r.sourceId,petId:r.petId,sourceType:"care_update",text:r.body,start:0,end:r.body.length}));
 assert.deepEqual(publicationSources(f.evidence),[]);
 assert.deepEqual(derivePublicationAuthority(f.evidence,rows).authorizedSourceIds,[]);
 assert.ok(historyLabsAuthorityFailure(f.result));
});
