import test from "node:test";
import assert from "node:assert/strict";
import {reviewClinicalAnswer,renderMedicationDecision,validateClinicalAssessment} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {recoverIndependentOriginalRead} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {reconcileExplicitMeasurementAxis} from "../app/lib/ask-read-only/measurement-requests.mjs";
import {readCoverageMessages} from "../app/lib/ask-read-only/coverage.mjs";
const wire=(extra={})=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[],...extra});
const owners=[{ref:"owner1",text:"An old limp resolved years ago. There are no symptoms now."}];
const conditional={event:"other_urgent_signs",occurrence:"conditional",ownerStatementRef:null};
function reviewed(initial,final,occurrence="none",components=[]){
 return reviewClinicalAnswer({components,appHelp:{intent:"none",pet:null},clinicalReview:{assessment:final,concernReview:{occurrence,sentence:occurrence==="none"?null:"owner1:c2"},ownerStatementRefs:[],observationFields:[]}},validateClinicalAssessment(initial,owners),owners,[]);
}
const base={answer:"Generated direction must not leak.",quotes:[],sources:[],calculations:[],replyType:"answer",limited:false,presentation:{}};
test("resolved-only answer is direct even when a conditional warning is retained",()=>{
 const s=wire({careContext:"clinical_history",eventAssessments:[conditional]});
 const r=reviewed(s,s,"negated");
 const out=renderMedicationDecision(base,r.policy,owners);
 assert.match(out.answer,/^A historical or resolved report by itself does not establish a current emergency/);
 assert.match(out.answer,/If .*emergency veterinarian immediately/);
 assert.doesNotMatch(out.answer,/Generated direction|healthy now|safe to wait/);
});
test("a current acute event cannot acquire past-only clearance",()=>{
 const current={event:"collapse",occurrence:"current",ownerStatementRef:"owner1"};
 const r=reviewed(wire({careContext:"current_concern",eventAssessments:[current]}),wire({careContext:"clinical_history"}),"negated");
 assert.equal(r.policy.historicalOnly,false);
 assert.match(renderMedicationDecision(base,r.policy,owners).answer,/^Contact an emergency veterinarian now/);
});
test("conditional warnings supplement a benign explanation without retaining weaker warning prose",()=>{
 const s=wire({careContext:"education",eventAssessments:[conditional]});
 const r=reviewed(s,s,"none");
 const out=renderMedicationDecision({...base,validatedParts:[{index:0,kind:"general",text:"Sleeping dogs can twitch during dreaming. If a severe sign occurs, ask a vet tomorrow."}]},r.policy,owners);
 assert.match(out.answer,/Sleeping dogs can twitch during dreaming/);
 assert.match(out.answer,/emergency veterinarian immediately/);
 assert.doesNotMatch(out.answer,/tomorrow/);
});
test("medication and current-concern policies never preserve general regimen prose",()=>{
 for(const change of [{medicationIntent:"decision"},{careContext:"current_concern"}]){
  const s=wire(change),r=reviewed(s,s,change.careContext?"current":"none");
  const out=renderMedicationDecision({...base,validatedParts:[{index:0,kind:"general",text:"Give an extra dose."}]},r.policy,owners);
  assert.doesNotMatch(out.answer,/Give an extra dose/);
 }
});
test("separately phrased full event/saved timestamps recover a single complete original",()=>{
 const pet={handle:"p1",name:"Juniper"},task={id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,recordMode:"collection",reference:null,pets:["p1"],missing:[],includeSourceDates:false};
 const first={calls:[],historyIntent:{requested:true,timeBasis:"event"},safety:{currentEvents:[]}};
 const r=recoverIndependentOriginalRead(first,[task],{pets:[pet],question:"Give Juniper's entire October 2023 original care note, the full event timestamp, and the full saved timestamp."});
 assert.equal(r.plan[0].recordMode,"single");assert.equal(r.plan[0].includeSourceDates,true);
 assert.equal(JSON.parse(r.first.calls[0].arguments).goal,"exact_quote");
});
test("explicit date axis corrects fresh IO hints without reinterpreting retained locators",()=>{
 const fresh={timeBasis:"recorded",start:{reference:null},finish:{reference:null}};
 assert.equal(reconcileExplicitMeasurementAxis([fresh],"Compare weights and give event dates.")[0].timeBasis,"event");
 assert.equal(reconcileExplicitMeasurementAxis([{...fresh,start:{reference:"r1"}}],"Give event dates.")[0].timeBasis,"recorded");
 assert.equal(reconcileExplicitMeasurementAxis([fresh],"Give event dates and saved dates.")[0].timeBasis,"recorded");
});
test("bounded-reference warning gives original scope and exact re-read instants, never inventing omitted dates",()=>{
 const row={scope:{pet:"Juniper",goal:"complete_set",orderBy:"event",from:"2021-01-01",to:"2023-12-31"},sources:[{eventAt:"2022-04-15T12:00:00Z"}],returned:1,inspected:1,discovery:[],unmet:["prior_source_selection_omitted"]};
 const text=readCoverageMessages([row]).join(" ");
 assert.match(text,/Original reference scope: event dates 2021-01-01 to 2023-12-31/);
 assert.match(text,/Re-read original event instants: 2022-04-15T12:00:00Z/);
 assert.match(text,/individual dates and contents are not established/);
});

import {renderDeclaredAbsentPet} from "../app/lib/ask-read-only/declared-unavailability.mjs";
test("explicit absent-pet information limit replaces only the unsupported read notice and preserves independent prose",()=>{
 const a={answer:"Cats knead as a comfort behavior.\n\nGeneral guidance: This requested action is unavailable through read-only Ask.",sources:[],taskCompletion:[{id:"t1",kind:"general_guidance",reason:"not_supported",status:"unresolved",sourceCount:0},{id:"t2",kind:"general_guidance",reason:"none",status:"complete",sourceCount:0}],limited:true,replyType:"partial"};
 const q="Nova is not an owned pet in my account. Can you get Nova's weight? Separately, why do cats knead?";
 const out=renderDeclaredAbsentPet(a,q,[{name:"Juniper"}],0);
 assert.match(out.answer,/Cats knead/);assert.match(out.answer,/don't have a verified saved weight for Nova/);assert.equal(out.limited,false);assert.ok(out.taskCompletion.every(t=>t.status==="complete"));
 for(const [question,pets,reads] of [[q,[{name:"Nova"}],0],[q,[],1],[q.replace("get","save"),[],0],[q.replace("is not","might not be"),[],0]]){
  assert.equal(renderDeclaredAbsentPet(a,question,pets,reads),a);
 }
});

import {renderAppWorkflow} from "../app/lib/ask-read-only/app-capabilities.mjs";
test("History category guidance uses actual registry values beyond Activity",()=>{
 for(const [word,label] of [["grooming","Grooming"],["food","Food"]]){
  const out=renderAppWorkflow({answer:"",presentation:{}},{intent:"find_care_note",pet:"p1"},[{handle:"p1",name:"Juniper",id:"owned-pet"}],false,"How do I use History to find Juniper\'s "+word+" entries?");
  assert.ok(out.answer.includes("Pet: Juniper; Category: "+label));
 }
});

import {explicitHistoryControlRequest} from "../app/lib/ask-read-only/app-capabilities.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
test("History target and controls can occur in separate clauses",()=>{
 assert.equal(explicitHistoryControlRequest("Help me browse Juniper's food notes in History myself. Which visible controls and pet/category selections should I use?"),true);
 assert.equal(explicitHistoryControlRequest("Which controls should I use to delete History notes?"),false);
});
test("actual source pipeline preserves whole originals, timestamp meaning and coverage instants across the body-free boundary",async()=>{
 const pet={id:"private-owner-pet-2026",ownerId:"owner",name:"Juniper",species:"dog"};
 const row={kind:"history",id:"private-original-2026",ownerId:"owner",petId:pet.id,body:"Juniper weighed 8.20 kg. A routine grooming check was recorded.",eventAt:"2021-05-15T12:00:00Z",recordedAt:"2021-05-16T12:00:00Z"};
 const s=wire(),task={id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"collection",workflow:"none",pets:["p1"],reference:null,missing:[]};
 let reads=0;
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"Show Juniper's complete May 2021 original and both full instants. Explain what each timestamp means.",now:"2026-11-15T12:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>phase==="read_selection"?decodeComponentSelection({safety:s,reads:[],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[task],measurementRequests:[]},req.tools,req.context,decodeClinicalSelection):{
   components:[{kind:"saved",text:"A selected saved statement.",sources:["s1"]}],quotes:[],sources:["s1"],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},
   clinicalReview:{assessment:s,concernReview:{occurrence:"none",sentence:null,pastReportSentence:null},ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},
   completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[]}]
  },
  read:async request=>{reads++;assert.equal(request.goal,"exact_quote");return {sources:[row],total:1,scopeExhausted:true};}
 });
 assert.equal(reads,1);assert.equal(result.answer.quotes[0].quote,row.body);
 assert.match(result.answer.answer,/Event time refers to the reported care occurrence/);
 assert.equal(result.answer.presentation.sourceDates[0].eventAt,row.eventAt);
 assert.equal(result.coverage[0].sources,undefined);
 assert.deepEqual(result.coverage[0].sourceInstants,[{eventAt:row.eventAt,recordedAt:row.recordedAt}]);
 const coverage=readCoverageMessages([{...result.coverage[0],discovery:[],unmet:["prior_source_selection_omitted"]}]).join(" ");
 assert.ok(coverage.includes(row.eventAt));assert.doesNotMatch(coverage,/instants: none/);
});
test("current normality plus a future warning does not acquire historical-report boilerplate",()=>{
 const s=wire({careContext:"education",eventAssessments:[conditional]});
 const value={components:[],appHelp:{intent:"none",pet:null},clinicalReview:{assessment:s,concernReview:{occurrence:"negated",sentence:"owner1:c2",pastReportSentence:null},ownerStatementRefs:[],observationFields:[]}};
 const r=reviewClinicalAnswer(value,validateClinicalAssessment(wire({careContext:"clinical_history",eventAssessments:[conditional]}),owners),owners,[]);
 assert.equal(r.policy.historicalOnly,false);
 const out=renderMedicationDecision(base,r.policy,owners);
 assert.match(out.answer,/If .*emergency veterinarian immediately/);
 assert.doesNotMatch(out.answer,/historical|resolved report|Describe this/);
});
test("a separately selected actual past report keeps direct historical reasoning without downgrading current urgency",()=>{
 const s=wire({careContext:"clinical_history",eventAssessments:[conditional]});
 const value={components:[],appHelp:{intent:"none",pet:null},clinicalReview:{assessment:s,concernReview:{occurrence:"negated",sentence:"owner1:c2",pastReportSentence:"owner1:c1"},ownerStatementRefs:[],observationFields:[]}};
 const r=reviewClinicalAnswer(value,validateClinicalAssessment(s,owners),owners,[]);
 assert.equal(r.policy.historicalOnly,true);assert.match(renderMedicationDecision(base,r.policy,owners).answer,/^A historical or resolved report by itself/);
 const bad=structuredClone(value);bad.clinicalReview.concernReview.pastReportSentence="unowned-sentence";
 assert.throws(()=>reviewClinicalAnswer(bad,validateClinicalAssessment(s,owners),owners,[]),/CLINICAL_CONTRACT/);
});
