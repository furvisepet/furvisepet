import assert from "node:assert/strict";
import test from "node:test";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c);}});
const {bindCalculatePlan,rebindCalculatePlan,calculatePlanSchema,CALCULATE_OPERATORS}=await import("../../app/lib/furvise-brain/calculate-plan.ts");
const {executeCalculatePlan}=await import("../../app/lib/furvise-brain/muscle.ts");
const {bindTypedReadTicket}=await import("../../app/lib/furvise-brain/typed-read-ticket.ts");
const {retrieveReadTicket}=await import("../../app/lib/furvise-brain/lungs.ts");
const {validateAskRequest,askRequestProviderSchema}=await import("../../app/lib/intelligence/ask-request-contract.ts");
const {generateContextAwareAskResponse}=await import("../../app/lib/ai/ask-reasoning.ts");
const {buildLabsList}=await import("../../app/lib/intelligence/labs-list.ts");
const {buildCalculationLabs,calculationPublicationFailure}=await import("../../app/lib/intelligence/calculation-labs.ts");
const {reviewHistoricalAnswer}=await import("../../app/lib/intelligence/review-history-narrative.ts");
const {validateGeneratedAnswer}=await import("../../app/lib/intelligence/validation/validate-answer.ts");
const {finalizeAskAnswer}=await import("../../app/lib/intelligence/finalize-ask-answer.ts");
const {buildGovernedAskExecutionPlan}=await import("../../app/lib/intelligence/ask-execution-plan.ts");
const {resolveSafetyState}=await import("../../app/lib/intelligence/safety-state.ts");
const pets=[{id:"owned-a",name:"Subject One",user_id:"owner",species:"dog"},{id:"owned-b",name:"Subject Two",user_id:"owner",species:"cat"}];
const row=(id,value,day=1,petId=pets[0].id)=>({id,user_id:"owner",pet_profile_id:petId,note:value,title:null,category:"general",deleted_at:null,
 occurred_at:new Date(Date.UTC(2024,0,day)).toISOString(),created_at:new Date(Date.UTC(2024,0,day)).toISOString(),updated_at:new Date(Date.UTC(2024,0,day)).toISOString()});
const rows=()=>[row("first","sample 4.8 kg"),row("last","sample 5.1 kg",3)];
const clause=(direction,count=1)=>({orderBy:[{field:"event_at",direction}],take:{count,per:"group"}});
const rawTicket=(count=false)=>({operation:"read",temporal:{from:null,to:null,anchor:null},predicates:[],
 selection:count?null:{groupBy:["subject"],union:[clause("asc"),clause("desc")]},
 outputs:{completeness:count?"exhaustive":"sufficient",ordering:"asc",limit:null}});
const slot=(clause=0,item=0,petName=pets[0].name,field="measurement",unit="kg")=>({petName,clause,item,field,unit});
// Migrate legacy offline fixture argument conventions centrally. Production never infers roles.
// Explicit roles are retained; malformed-role tests delete/change them after construction.
const fixtureRoles={difference:["target","reference"],ratio:["reference","target"],percent_change:["reference","target"],
 elapsed_days:["start","end"],convert:["source"],percent_of_sum:["part"]};
const calculation=(operator="difference",operands=[slot(1),slot(0)],resultUnit="kg",id="c1")=>({id,operator,
 operands:operands.map((o,i)=>({role:fixtureRoles[operator]?.[i]??"member",...o})),resultUnit,precision:null});
const proposal=calculations=>({operation:"calculate",calculations});
const envelope=(plan,ticket)=>({version:"ask-request.v2",mode:"read",question:"Calculate from saved observations.",requirements:[],referenceTurnIds:[],
 scope:"named",petNames:[pets[0].name],operation:"recall",selection:"summary",quantity:"measurement",topic:"observations",terms:[],from:null,to:null,
 episodeTopic:null,ordinal:null,frame:null,evidenceBasis:"saved_history",premiseQuotes:[],calculatePlan:plan,readTicket:ticket});
async function fixture({calculations=[calculation()],sourceRows=rows(),ticket=rawTicket(),subjects=[pets[0]],format="prose",closed=true,limit,storeFactory,resultSelection,question="Calculate from saved observations."}={}){
 let calls=0;
 const client={responses:{create:async()=>{calls++;throw Error("CALCULATION_PROVIDER_FORBIDDEN");}}};
 const context={feature:"ask",pet:subjects[0],eligiblePets:[...new Map([...pets,...subjects].map(p=>[p.id,p])).values()],owner:{userId:"owner"},currentMessage:question,
  currentTimestamp:"2026-09-24T00:00:00Z",conversationTurns:[],careEntries:[],memories:[],activeConcerns:[],recentlyResolvedConcerns:[],timeZone:"UTC"};
 const plan=proposal(calculations);if(resultSelection!==undefined)plan.resultSelection=resultSelection;
 const p=envelope(plan,ticket);p.question=question;p.petNames=subjects.map(p=>p.name);p.outputFormat=format;
 const interpretation=validateAskRequest(p,context),bound=interpretation.request.readTicket;
 const reads=[];
 const store={page:async q=>{reads.push(q);return sourceRows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&r.occurred_at>=q.from&&r.occurred_at<q.to)
  .sort((a,b)=>(q.ordering==="desc"?-1:1)*(Date.parse(a.occurred_at)-Date.parse(b.occurred_at))).slice(q.offset,q.offset+q.limit);},
 effective:async records=>({records,reliable:closed}),
 effectiveWindow:async({rows})=>({records:rows,lineageClosed:closed,replacementSeedsExhausted:closed,sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:closed?[]:["incomplete_lineage"]})};
 const result=await retrieveReadTicket(bound,{userId:"owner",ownedPetIds:subjects.map(p=>p.id),from:"2020-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-09-24T00:00:00Z"},storeFactory?storeFactory():store,limit);
 const evidence={version:"ask-evidence.v1",petNames:Object.fromEntries(subjects.map(p=>[p.id,p.name])),
 scope:{authorizedPetIds:subjects.map(p=>p.id),status:"resolved",readOnlyRecall:true,requestKind:"record_lookup",requestText:context.currentMessage},interpretation,
 history:{ticketCoverage:result.coverage,provenance:[],candidateIds:result.records.map(r=>"care:"+r.id),eventCandidateIds:[],reasons:[],needs:[]},
 sources:[],represented:[],losses:[],verifiedFacts:[],representation:"complete",completeness:{retrieval:"unknown",corrections:"unknown",extraction:"unknown",grouping:"unknown"}};
 context.askInterpretation=interpretation;context.careEntries=result.records;
 const input={question:context.currentMessage,profiles:subjects,careEntries:result.records,memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],evidenceContract:evidence,client};
 const response=await generateContextAwareAskResponse(input);
 return {context,input,evidence,result,response,reads,plan:interpretation.request.calculatePlan,calls:()=>calls,client,subjects};
}
async function finish(f){
 const safety=resolveSafetyState(f.context);
 const executionPlan=buildGovernedAskExecutionPlan({sourceMessageId:"source",petId:f.subjects[0].id,careActions:[],semanticEvents:[],learnings:[]});
 const r=await finalizeAskAnswer({reasoning:f.response,context:f.context,requestId:"offline-calculate",authoritativePetIds:f.subjects.map(p=>p.id),executionPlan,safety});
 assert.equal(r.validation.valid,true,r.validation.errors.join());
 assert.equal(f.calls(),0);
 for(const key of ["applicationActions","careActions","semanticEvents","learnings"])assert.deepEqual(r.validation.response[key],[]);
 return r.validation;
}

export {assert,test,bindCalculatePlan,rebindCalculatePlan,calculatePlanSchema,CALCULATE_OPERATORS,executeCalculatePlan,bindTypedReadTicket,retrieveReadTicket,validateAskRequest,askRequestProviderSchema,generateContextAwareAskResponse,buildLabsList,buildCalculationLabs,calculationPublicationFailure,reviewHistoricalAnswer,validateGeneratedAnswer,finalizeAskAnswer,buildGovernedAskExecutionPlan,resolveSafetyState,pets,row,rows,clause,rawTicket,slot,calculation,proposal,envelope,fixture,finish};
