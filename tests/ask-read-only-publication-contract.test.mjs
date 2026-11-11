import test from "node:test";
import assert from "node:assert/strict";
import {validateReadOnlyAnswer} from "../app/lib/ask-read-only/core.mjs";
import {readCoverageMessages} from "../app/lib/ask-read-only/coverage.mjs";
const source={kind:"history",handle:"s1",id:"private-note-123456789",petId:"private-pet-123456789",body:"A historical observation.",eventAt:"2025-05-03T12:00:00Z",recordedAt:"2025-05-04T12:00:00Z",measurements:[]};
const answer=text=>({components:[{kind:"saved",text,sources:["s1"]}],sources:["s1"],quotes:["s1"],calculations:[],replyType:"answer"});
test("selected bracket citations render public provenance without editing the exact quote",()=>{
 const a=validateReadOnlyAnswer(answer("The observation was recorded [s1]."),[source]);
 assert.equal(a.answer,"The observation was recorded (saved note dated 2025-05-03).");
 assert.equal(a.citationReferencesTranslated,1);assert.equal(a.quotes[0].quote,source.body);
});
test("parenthesized citations use the same checked source",()=>{
 assert.match(validateReadOnlyAnswer(answer("Recorded (s1)."),[source]).answer,/saved note dated 2025-05-03/);
});
for(const [text,category] of [[source.id,"private_identifier"],[source.petId,"private_identifier"],["unselected [s2]","opaque_source_handle"],["pet p1","opaque_pet_handle"],["bare s1","opaque_source_handle"],["measurement [s1:m1]","opaque_source_handle"]]){
 test("unsafe prose remains rejected: "+category+" "+text.slice(0,8),()=>{
  assert.throws(()=>validateReadOnlyAnswer(answer(text),[source],"repeat "+text),e=>e.code==="ASK_READ_INTERNAL_ID"&&e.answerDiagnostic.category===category);
 });
}
test("coverage separates query exhaustion, admitted evidence and semantic recall",()=>{
 const [text]=readCoverageMessages([{scope:{pet:"Spruce",goal:"complete_set",from:"2025-01-01",to:"2025-12-31"},returned:32,inspected:48,omitted:16,truncated:true,queryScopeExhausted:true,discovery:[{mode:"scoped",inspected:48,total:48,pages:3,exhausted:true}],unmet:["evidence_omitted"]}]);
 assert.match(text,/32 notes supplied to the answer model from 48 distinct database candidates examined/);
 assert.match(text,/16 examined notes omitted/);assert.match(text,/does not establish semantic completeness/);assert.match(text,/3 database page/);
});
