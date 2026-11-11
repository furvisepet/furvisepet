import test from "node:test";
import assert from "node:assert/strict";
import {clinicalSelectionSchema,decodeClinicalSelection,clinicalAnswerSchema,reviewClinicalAnswer} from "../app/lib/ask-read-only/clinical.mjs";
import {runReadOnlyAsk,readOnlyAnswerSchemaForSources,validateReadOnlyAnswer} from "../app/lib/ask-read-only/core.mjs";
import {readOnlyProvider} from "../app/lib/ask-read-only/provider.ts";
const assessment=(extra={})=>({medicationIntent:"none",scenario:"none",urgency:"routine",referent:"clear",missingContext:[],...extra});
const component=(kind,text)=>({kind,text,sources:[]});
const answer=(s=assessment(),extra={})=>({presentation:{sourceDates:[],contextRequired:false},components:[component("general","Independent useful information.")],sources:[],quotes:[],calculations:[],replyType:"answer",clinicalReview:{assessment:s,medicationDisposition:"not_applicable",regimenDecision:"not_provided",symptomStabilityAuthorization:"not_permitted",handoffIndex:-1,contactTiming:"none",contactRecipient:"none",questionsForMissingContext:[]},...extra});
const decision=assessment({medicationIntent:"decision",scenario:"current",urgency:"prompt",missingContext:["medicine","prescription","vet_plan"]});
const decisionAnswer=()=>{const a=answer(decision,{replyType:"clarification",components:[component("limitation","Please contact the prescribing veterinarian promptly; what medicine, exact prescription and approved plan are involved?")]});Object.assign(a.clinicalReview,{medicationDisposition:"refer_prescriber",handoffIndex:0,contactTiming:"prompt",contactRecipient:"prescriber",questionsForMissingContext:decision.missingContext});return a;};
const input={ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"dog"}],question:"An unfamiliar question.",dialogue:[],now:"2026-01-01T00:00:00Z",timeZone:"UTC"};
test("medication decisions cannot become a complete answer or authorize a regimen",()=>{
 const s=clinicalAnswerSchema(readOnlyAnswerSchemaForSources([]),decision);
 assert.deepEqual(s.properties.replyType.enum,["clarification","partial"]);
 for(const variant of s.properties.clinicalReview.anyOf)assert.deepEqual(variant.properties.medicationDisposition.enum,["refer_prescriber"]);
 const a=decisionAnswer();a.replyType="answer";
 assert.throws(()=>reviewClinicalAnswer(a,decision),/CLINICAL_CONTRACT/);
 a.replyType="clarification";a.clinicalReview.regimenDecision="approved";
 assert.throws(()=>reviewClinicalAnswer(a,decision),/CLINICAL_CONTRACT/);
});
test("an initially recognized decision cannot be downgraded by final classification",()=>{
 const a=answer();assert.throws(()=>reviewClinicalAnswer(a,decision),/CLINICAL_CONTRACT/);
});
test("missing medication context must be carried as clarification and prescriber handoff",()=>{
 const a=decisionAnswer();assert.equal(reviewClinicalAnswer(a,decision).summary.medicationDisposition,"refer_prescriber");
 a.clinicalReview.questionsForMissingContext=[];assert.throws(()=>reviewClinicalAnswer(a,decision),/CLINICAL_CONTRACT/);
});
test("benign organization is not refused or routed into regimen assessment",()=>{
 const s=assessment({medicationIntent:"organization"});const a=answer(s);a.clinicalReview.medicationDisposition="organization_only";
 assert.equal(reviewClinicalAnswer(a,s).value.replyType,"answer");
});
test("current emergency cannot be downgraded to routine timing or historical status",()=>{
 const s=assessment({scenario:"current",urgency:"immediate"});const a=answer();
 assert.throws(()=>reviewClinicalAnswer(a,s),/CLINICAL_CONTRACT/);
 a.components=[component("general","Independent checklist."),component("emergency","Seek emergency veterinary care immediately.")];
 Object.assign(a.clinicalReview,{handoffIndex:1,contactTiming:"immediate",contactRecipient:"emergency_veterinarian"});
 const out=reviewClinicalAnswer(a,s);assert.equal(out.summary.currentEmergency,true);assert.equal(out.value.components[0].kind,"emergency");
});
test("historical/conditional reports cannot silently claim a current emergency",()=>{
 const s=assessment({scenario:"historical"}),a=answer(s);a.components=[component("emergency","A current emergency assertion.")];
 assert.throws(()=>reviewClinicalAnswer(a,s),/CLINICAL_CONTRACT/);
 const h=assessment({scenario:"hypothetical",urgency:"immediate"}),b=answer(h);b.components=[component("conditional_emergency","If this happens, seek emergency care immediately.")];
 Object.assign(b.clinicalReview,{handoffIndex:0,contactTiming:"immediate",contactRecipient:"emergency_veterinarian"});
 assert.equal(reviewClinicalAnswer(b,h).summary.currentEmergency,false);
});
test("first-pass emergency suppresses optional record IO and strips draft without a third call",async()=>{
 let calls=0;
 const s=assessment({scenario:"current",urgency:"immediate"}),a=answer(s);
 a.components=[component("emergency","Seek emergency veterinary care immediately.")];
 Object.assign(a.clinicalReview,{handoffIndex:0,contactTiming:"immediate",contactRecipient:"emergency_veterinarian"});
 const out=await runReadOnlyAsk(input,{read:async()=>{throw Error("Must not delay care with records");},provider:async(packet,phase)=>{
  calls++;if(phase==="read_selection")return {safety:s,text:"An unsafe draft must not anchor the answer.",calls:[{id:"x",name:"search_saved_records",arguments:"{}"}]};
  assert.equal(packet.draft,"");assert.equal(packet.TOOL_DATA.length,0);return a;
 }});
 assert.equal(calls,2);assert.equal(out.answer.clinicalUrgency,"urgent");
});
test("essential unknown meaning suppresses history while preserving independent components",async()=>{
 const s=assessment({referent:"essential_unknown",missingContext:["procedure"]}),a=answer(s,{replyType:"clarification"});
 a.clinicalReview.questionsForMissingContext=["procedure"];
 const out=await runReadOnlyAsk(input,{read:async()=>{throw Error("Irrelevant history must not run");},provider:async(_p,phase)=>phase==="read_selection"?{safety:s,text:"",calls:[{id:"x",name:"search_saved_records",arguments:"{}"}]}:a});
 assert.ok(out.answer.answer.includes("Independent"));assert.equal(out.providerCallCount,2);
});
test("actual provider adapter requests strict first-pass safety and bounded reads",async()=>{
 const tools=[{name:"read_pet_profile",parameters:{type:"object",additionalProperties:false,properties:{pet:{type:"string",enum:["p1"]}},required:["pet"]}}];
 const payload={safety:assessment(),reads:[{name:"read_pet_profile",arguments:{pet:"p1"}}],draft:""};
 const requests=[],client={responses:{create:async req=>{requests.push(req);return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(payload)}]}]};}}};
 const out=await readOnlyProvider("offline",()=>{},client)({instructions:"Review.",context:{},tools,selectionSchema:clinicalSelectionSchema(tools)},"read_selection");
 assert.equal(requests[0].text.format.strict,true);assert.equal(requests[0].tools,undefined);assert.equal(out.safety.medicationIntent,"none");
 assert.equal(out.calls[0].arguments,JSON.stringify({pet:"p1"}));
 assert.throws(()=>decodeClinicalSelection({...payload,reads:Array(5).fill(payload.reads[0])},tools),/CLINICAL_CONTRACT/);
});
test("reproduced schema/authority mismatch has precise structural-only diagnostics",()=>{
 const a={components:[{kind:"general",text:"Private prose must not be logged.",sources:["s1"]}],quotes:[],sources:[],calculations:[],replyType:"answer"};
 assert.throws(()=>validateReadOnlyAnswer(a,[{handle:"s1",kind:"history"}]),error=>{
  assert.equal(error.answerDiagnostic.field,"component_authority");
  assert.ok(!JSON.stringify(error.answerDiagnostic).includes("Private"));return true;
 });
});

test("prompt current clinical concern requires a bound professional handoff",()=>{
 const s=assessment({scenario:"current",urgency:"prompt"}),a=answer(s);
 assert.throws(()=>reviewClinicalAnswer(a,s),/CLINICAL_CONTRACT/);
 Object.assign(a.clinicalReview,{handoffIndex:0,contactTiming:"prompt",contactRecipient:"veterinarian"});
 assert.equal(reviewClinicalAnswer(a,s).summary.contactTiming,"prompt");
});
test("recognized safety assessment requires final review rather than legacy bypass",()=>{
 const a=decisionAnswer();delete a.clinicalReview;
 assert.throws(()=>reviewClinicalAnswer(a,decision),/CLINICAL_CONTRACT/);
});
test("actual answer wire retains clinical constraints alongside evidence",async()=>{
 const wires=[],client={responses:{create:async request=>{wires.push(request);return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(answer())}]}]};}}};
 await readOnlyProvider("offline",()=>{},client)({instructions:"Review.",context:{},draft:"",TOOL_DATA:[],SOURCE_CATALOG:[],CLINICAL_CONSTRAINTS:decision,schema:clinicalAnswerSchema(readOnlyAnswerSchemaForSources([]),decision)},"read_answer");
 assert.equal(JSON.parse(wires[0].input[0].content).CLINICAL_CONSTRAINTS.medicationIntent,"decision");
});

test("medication handoff wire excludes ordinary wrong-recipient/timing combinations without weakening validator",()=>{
 const schema=clinicalAnswerSchema(readOnlyAnswerSchemaForSources([]),decision);
 const [ordinary,urgent]=schema.properties.clinicalReview.anyOf;
 assert.deepEqual(ordinary.properties.contactRecipient.enum,["prescriber"]);
 assert.deepEqual(ordinary.properties.contactTiming.enum,["prompt","immediate"]);
 assert.equal(ordinary.properties.handoffIndex.minimum,0);
 assert.deepEqual(urgent.properties.assessment.properties.scenario.enum,["current"]);
 assert.deepEqual(urgent.properties.assessment.properties.urgency.enum,["immediate"]);
 assert.deepEqual(urgent.properties.contactRecipient.enum,["emergency_veterinarian","veterinarian_or_poison_service"]);
 const a=decisionAnswer();a.clinicalReview.contactRecipient="veterinarian";
 assert.throws(()=>reviewClinicalAnswer(a,decision),error=>{
  assert.equal(error.answerDiagnostic.field,"prescriber_handoff");
  assert.equal(error.answerDiagnostic.contactRecipient,"veterinarian");
  assert.equal(error.answerDiagnostic.contactTiming,"prompt");return true;
 });
});

test("active two-call core removes misleading prose despite compliant medication metadata",async()=>{
 const a=decisionAnswer();
 a.components[0].text="Returning to the previous timing would be the safest move. Contact the prescriber if worried.";
 const out=await runReadOnlyAsk(input,{read:async()=>{throw Error("No read intended");},provider:async(_packet,phase)=>phase==="read_selection"?{safety:decision,text:"",calls:[]}:a});
 assert.equal(out.providerCallCount,2);
 assert.equal(out.answer.answer.includes("safest move"),false);
 assert.match(out.answer.answer,/prescribing veterinarian promptly/);
 assert.match(out.answer.answer,/medicine name and strength/);
 assert.equal(out.answer.replyType,"partial");
});
test("actual strict adapter distinguishes JSON and clinical shape errors without private output",async()=>{
 for(const [text,expected] of [["PRIVATE malformed {","ASK_READ_OUTPUT_JSON"],[JSON.stringify({private:"not selection"}),"ASK_READ_CLINICAL_CONTRACT"]]){
  const events=[],client={responses:{create:async()=>({status:"completed",output_text:"",output:[{type:"message",content:[{type:"output_text",text}]}]})}};
  const tools=[{name:"read_pet_profile",parameters:{type:"object",properties:{},required:[],additionalProperties:false}}];
  await assert.rejects(readOnlyProvider("offline",e=>events.push(e),client)({context:{},tools,selectionSchema:clinicalSelectionSchema(tools)},"read_selection"),error=>{
   assert.equal(error.stage,"primary_invalid_output");
   assert.equal(error.diagnostics.providerErrorCode,expected);
   assert.ok(!JSON.stringify(error.diagnostics).includes("PRIVATE"));
   return true;
  });
  const failed=events.find(e=>e.outcome==="failed");
  assert.equal(JSON.parse(failed.validationDetails).code,expected);
 }
});

test("actual adapter emits phase diagnostics for commentary plus final structured selection",async()=>{
 const events=[],payload={safety:assessment(),reads:[],draft:""};
 const client={responses:{create:async()=>({status:"completed",output_text:"Commentary"+JSON.stringify(payload),output:[{type:"message",phase:"commentary",content:[{type:"output_text",text:"Commentary"}]},{type:"message",phase:"final_answer",content:[{type:"output_text",text:JSON.stringify(payload)}]}]})}};
 const tools=[{name:"read_pet_profile",parameters:{type:"object",properties:{},required:[],additionalProperties:false}}];
 const out=await readOnlyProvider("offline",e=>events.push(e),client)({context:{},tools,selectionSchema:clinicalSelectionSchema(tools)},"read_selection");
 assert.equal(out.calls.length,0);
 const details=JSON.parse(events.find(e=>e.outcome==="succeeded").validationDetails);
 assert.equal(details.outputLayout.selectedPhase,"final_answer");
 assert.equal(details.outputLayout.commentaryMessages,1);
 assert.equal(details.outputLayout.aggregateJsonValid,false);
});
