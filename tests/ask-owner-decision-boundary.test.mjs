import test from "node:test";
import assert from "node:assert/strict";
import {renderMedicationDecision} from "../app/lib/ask-read-only/clinical.mjs";
import {decodeProviderJson,safeReadOutputDiagnostic,describeReadOutput} from "../app/lib/ask-read-only/provider-output.mjs";
const answer=text=>({answer:text,replyType:"partial",limited:false,quotes:[],calculations:[],presentation:{contextRequired:false,sourceDates:[]},sources:[]});
const decision={medicationIntent:"decision",currentEmergency:false,requiredInformation:["medicine","prescription","vet_plan"]};
for(const text of [
 "Return to the old regimen; it is safest.",
 "I cannot prescribe, but resuming the previous timing is sensible.",
 "Do not stop; instead restart as before if she seems well.",
 "For the unrelated task, the next step is to double the interval.",
 "It would not be unsafe to resume the prior plan.",
 "No need to contact the vet. Your old schedule is appropriate."
])test("recognized decision cannot display arbitrary prose: "+text,()=>{
 const result=renderMedicationDecision(answer(text),decision);
 assert.equal(result.answer.includes(text),false);
 assert.match(result.answer,/prescribing veterinarian promptly/);
 assert.match(result.answer,/medicine name and strength/);
 assert.equal(result.replyType,"partial");assert.equal(result.limited,true);
});
test("safe organization and nonmedical answers retain their words",()=>{
 for(const intent of ["none","organization"]){
 const input=answer("Make a checklist with one row per actual administration.");
 assert.equal(renderMedicationDecision(input,{medicationIntent:intent}),input);
 }
});
test("newly recognized emergency overrides routine referral; verified data survives",()=>{
 const input={...answer("unsupported directive"),quotes:[{source:"S1",quote:"Original saved report"}],calculations:[{text:"Verified arithmetic"}]};
 const result=renderMedicationDecision(input,{...decision,currentEmergency:true});
 assert.match(result.answer,/emergency veterinarian now/);
 assert.equal(result.quotes,input.quotes);assert.equal(result.calculations,input.calculations);
 assert.match(result.answer,/do not authorize/);
});
test("blank SDK output_text falls back to message content",()=>{
 assert.deepEqual(decodeProviderJson({output_text:"",output:[{type:"reasoning"},{type:"message",content:[{type:"output_text",text:'{"reads":[]}'}]}]}),{reads:[]});
});
test("invalid output has bounded diagnostics without text or identifiers",()=>{
 for(const [response,code] of [
 [{output:[]},"ASK_READ_OUTPUT_EMPTY"],
 [{output:[{type:"message",content:[{type:"output_text",text:"private pet record invalid json"}]}]},"ASK_READ_OUTPUT_JSON"],
 [{output:[{type:"function_call",arguments:"private"}]},"ASK_READ_UNEXPECTED_TOOL"]
 ]){
 assert.throws(()=>decodeProviderJson(response),error=>{
 assert.deepEqual(safeReadOutputDiagnostic(error),{code,field:code.endsWith("EMPTY")?"text":code.endsWith("JSON")?"json":"function_call"});
 assert.equal(JSON.stringify(safeReadOutputDiagnostic(error)).includes("private"),false);return true;
 });
 }
 assert.equal(safeReadOutputDiagnostic(new Error("private text")),null);
});

import {claimFailureCategory} from "../app/lib/security/idempotency/claim-diagnostic.ts";
test("claim diagnostics classify bounded errors and never execute unknown getters",()=>{
 assert.equal(claimFailureCategory({name:"AbortError",message:"private"}),"BACKEND_TIMEOUT");
 assert.equal(claimFailureCategory({code:"PGRST003",message:"private"}),"BACKEND_CONNECTION");
 assert.equal(claimFailureCategory({status:403,message:"private"}),"BACKEND_AUTHORIZATION");
 assert.equal(claimFailureCategory({code:"42P01",message:"private"}),"BACKEND_DATABASE");
 let invoked=0;const unknown={};
 for(const key of ["name","code","status","message"])Object.defineProperty(unknown,key,{get(){invoked++;throw Error("private");}});
 assert.equal(claimFailureCategory(unknown),"BACKEND_UNCLASSIFIED");assert.equal(invoked,0);
});
test("current emergency display cannot retain wait-and-see prose",()=>{
 const input=answer("Wait until tomorrow before calling.");
 const result=renderMedicationDecision(input,{medicationIntent:"none",currentEmergency:true,requiredInformation:[]});
 assert.match(result.answer,/emergency veterinarian now/);
 assert.equal(result.answer.includes("tomorrow"),false);assert.equal(result.clinicalUrgency,"urgent");
});

test("phase-aware JSON ignores commentary even when SDK aggregate includes it",()=>{
 const output=[{type:"reasoning"},{type:"message",phase:"commentary",content:[{type:"output_text",text:"I will inspect the saved records."}]},{type:"message",phase:"final_answer",status:"completed",role:"assistant",content:[{type:"output_text",text:'{"reads":[]}'}]}];
 const response={output,output_text:'I will inspect the saved records.{"reads":[]}'};
 assert.deepEqual(decodeProviderJson(response),{reads:[]});
 assert.deepEqual(describeReadOutput(response),{messages:2,finalMessages:1,unphasedMessages:0,commentaryMessages:1,otherPhaseMessages:0,parseableEligibleMessages:1,aggregateJsonValid:false,selectedPhase:"final_answer",selectionPolicy:"first_eligible",ignoredEligibleMessages:0});
});
test("a valid JSON commentary message never supplies final authority",()=>{
 assert.throws(()=>decodeProviderJson({output:[{type:"message",phase:"commentary",content:[{type:"output_text",text:'{"reads":[]}'}]}]}),/ASK_READ_OUTPUT_EMPTY/);
});
test("legacy unphased message and split content stay supported without aggregating messages",()=>{
 assert.deepEqual(decodeProviderJson({output_text:"wrong aggregate",output:[{type:"message",content:[{type:"output_text",text:'{"reads":'},{type:"output_text",text:"[]}"}]}]}),{reads:[]});
 for(const phase of [undefined,"final_answer"]){
 assert.deepEqual(decodeProviderJson({output:[1,2].map(n=>({type:"message",phase,content:[{type:"output_text",text:JSON.stringify({order:n})}]}))}),{order:1});
 }
});
test("incomplete selected message cannot become a successful structured answer",()=>{
 assert.throws(()=>decodeProviderJson({output:[{type:"message",phase:"final_answer",status:"incomplete",content:[{type:"output_text",text:"{}"}]}]}),/ASK_READ_OUTPUT_INCOMPLETE/);
});

test("multiple final documents use first canonical authority without concatenation",()=>{
 const output=[1,2].map(order=>({type:"message",phase:"final_answer",content:[{type:"output_text",text:JSON.stringify({order})}]}));
 assert.deepEqual(decodeProviderJson({output,output_text:'{"order":1}{"order":2}'}),{order:1});
 assert.equal(describeReadOutput({output}).ignoredEligibleMessages,1);
 output[0].content[0].text="broken JSON";
 assert.throws(()=>decodeProviderJson({output}),/ASK_READ_OUTPUT_JSON/);
});
