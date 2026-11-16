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
