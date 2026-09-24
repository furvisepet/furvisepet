import assert from "node:assert/strict";
import {bindTypedReadTicket} from "../../app/lib/furvise-brain/typed-read-ticket.ts";
import {retrieveReadTicket} from "../../app/lib/furvise-brain/lungs.ts";
import {generateContextAwareAskResponse} from "../../app/lib/ai/ask-reasoning.ts";
import {reviewHistoricalAnswer} from "../../app/lib/intelligence/review-history-narrative.ts";
import {validateGeneratedAnswer} from "../../app/lib/intelligence/validation/validate-answer.ts";
import {derivePublicationAuthority} from "../../app/lib/intelligence/publication-authority.ts";
export async function certifiedHistoryRead(original,{selection=null,temporal={from:null,to:null,anchor:null},predicates=[],format="prose"}={}) {
 const ids=original.scope.authorizedPetIds;
 const rows=original.represented.filter(s=>s.sourceType==="care_update").map(s=>({
  id:s.sourceId.replace(/^care:/,""),user_id:"owner",pet_profile_id:s.petId,note:s.text,title:null,category:"general",deleted_at:null,
  occurred_at:s.occurredAt,created_at:s.createdAt||s.occurredAt}));
 const ticket=bindTypedReadTicket({operation:"read",temporal,predicates,selection,outputs:{completeness:selection?"sufficient":"exhaustive",ordering:"asc",limit:null}},ids);
 const result=await retrieveReadTicket(ticket,{userId:"owner",ownedPetIds:ids,from:"1900-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-09-24T00:00:00Z"},{
  page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&Date.parse(r.occurred_at)>=Date.parse(q.from)&&Date.parse(r.occurred_at)<Date.parse(q.to))
   .sort((a,b)=>(q.ordering==="asc"?1:-1)*(Date.parse(a.occurred_at)-Date.parse(b.occurred_at))).slice(q.offset,q.offset+q.limit),
  effective:async records=>({records,reliable:true}),
  effectiveWindow:async({rows})=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
 const evidence={version:"ask-evidence.v1",petNames:original.petNames||{},scope:{authorizedPetIds:ids,requestText:"Typed record read.",status:"resolved",readOnlyRecall:true,requestKind:"record_lookup"},
  interpretation:{operation:"recall",readOperation:"recall",readOnly:true,petIds:ids,request:{mode:"read",evidenceBasis:"saved_history",quantity:"records",readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[],outputFormat:format}},
  history:{ticketCoverage:result.coverage,provenance:[],candidateIds:result.records.map(r=>"care:"+r.id),eventCandidateIds:[],reasons:[],needs:[]},
  sources:[],represented:[],losses:[],verifiedFacts:[],representation:"complete",completeness:{retrieval:"unknown",corrections:"complete",extraction:"unknown",grouping:"unknown"}};
 const pets=ids.map(id=>({id,user_id:"owner",name:original.petNames?.[id]||id,species:"dog"}));
 let calls=0;const client={responses:{create:async()=>{calls++;throw Error("CERTIFIED_READ_PROVIDER_FORBIDDEN");}}};
 const response=await generateContextAwareAskResponse({question:evidence.scope.requestText,evidenceContract:evidence,profiles:pets,careEntries:result.records,memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],client});
 assert.equal(response.model,"server-labs-list");assert.equal(await reviewHistoricalAnswer({result:response,client}),true);
 const validation=validateGeneratedAnswer(response,{pet:pets[0],owner:{userId:"owner"},eligiblePets:pets,currentMessage:evidence.scope.requestText,memories:[],careEntries:result.records},"routine",ids);
 assert.equal(validation.valid,true,validation.errors.join());
 const authority=derivePublicationAuthority(response.evidenceContract,response.labsList.records);assert.equal(authority.transportValid,true);
 assert.deepEqual(response.labsList.records.map(r=>[r.id,r.petId,r.body,r.event_at]),result.records.map(r=>[r.id,r.pet_profile_id,r.note,r.occurred_at]));
 assert.equal(calls,0);return {ticket,result,response,authority,validation};
}
