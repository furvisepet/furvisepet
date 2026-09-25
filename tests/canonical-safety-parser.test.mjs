import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {analyzeOwnerAssertions,isOwnerAssertedEvidence} from "../app/lib/ai/owner-assertion.ts";
import {safetyTemporalScope,currentSafetyClauses} from "../app/lib/ai/safety-temporal-scope.ts";
import {detectImmediateAskEmergency,conditionalEmergencyGuidance} from "../app/lib/ask-safety-context.ts";
import {resolveSafetyState} from "../app/lib/intelligence/safety-state.ts";
function state(currentMessage,patch={}) {
 return resolveSafetyState({currentMessage,pet:{id:"owned",name:"River"},owner:{userId:"owner"},eligiblePets:[],
 activeConcerns:[],recentlyResolvedConcerns:[],careEntries:[],activeEpisodes:[],monitoringEpisodes:[],currentState:null,...patch});
}
const quote=String.fromCharCode(34);
const cases=[
 ["real current","River collapsed and cannot breathe.",true,"emergency"],
 ["hypothetical","What if River collapses and cannot breathe?",false,"routine"],
 ["quoted only","An article says "+quote+"River collapsed and cannot breathe."+quote,false,"routine"],
 ["mixed quote and current","The article says "+quote+"dogs can collapse."+quote+" River cannot breathe right now.",true,"emergency"],
 ["historical","River collapsed and could not breathe last year.",false,"routine"],
 ["uncertain current","I think River cannot breathe right now.",true,"emergency"],
 ["stored urgent unrelated","What weight is saved for River?",false,"urgent",{currentState:{state:{breathing:{status:"abnormal"}}}}],
 ["general education","What causes seizures in dogs?",false,"routine"],
];
for(const [name,message,expected,level,patch] of cases)test("canonical safety: "+name,()=>{
 const s=state(message,patch);assert.equal(s.currentMessageEmergency,expected);
 assert.equal(s.level,level);
 assert.equal(Boolean(detectImmediateAskEmergency(message)),expected);
 if(!expected)assert.deepEqual(s.currentMessageConcernTags,[]);
 if(name==="hypothetical")assert.ok(analyzeOwnerAssertions(message).clauseSpans.every(c=>c.isConditional));
 if(name==="quoted only")assert.doesNotMatch(safetyTemporalScope(message).currentText,/collapsed|cannot breathe/);
 if(name==="mixed quote and current"){
  assert.doesNotMatch(safetyTemporalScope(message).currentText,/dogs can collapse/);
  assert.match(safetyTemporalScope(message).currentText,/River cannot breathe right now/);
 }
 if(name==="real current")assert.match(safetyTemporalScope(message).currentText,/River collapsed/);
});
test("conditional construction is generic and propagates across coordinated clauses",()=>{
 for(const proposition of ["River likes blue blankets","the pump is running","the package weighs 3 kg"]){
  const message="What if "+proposition+"?";
  assert.ok(analyzeOwnerAssertions(message).clauseSpans.every(c=>c.isConditional),message);
  assert.equal(isOwnerAssertedEvidence(message,proposition),false);
 }
 const message="What if River is restless and she has vomited?";
 assert.ok(analyzeOwnerAssertions(message).clauseSpans.every(c=>c.isConditional));
 assert.equal(analyzeOwnerAssertions(message).hasOwnerAssertion,false);
});
test("conditional guidance uses shared classification and never establishes current state",()=>{
 for(const prefix of ["What if","If","Suppose","Imagine","Assuming","Hypothetically,"]){
  const message=prefix+" my dog cannot breathe?";
  assert.equal(state(message).currentMessageEmergency,false,message);
  assert.ok(conditionalEmergencyGuidance(message),message);
 }
 assert.equal(conditionalEmergencyGuidance("An article says "+quote+"If my dog cannot breathe"+quote),null);
});
test("mask complete quotes before clause segmentation, preserving surrounding current assertions",()=>{
 for(const [open,close] of [[quote,quote],[String.fromCharCode(0x201c),String.fromCharCode(0x201d)],[String.fromCharCode(0x2018),String.fromCharCode(0x2019)]]){
  const message="The note says "+open+"River collapsed. River cannot breathe."+close+" River is eating now.";
  assert.equal(state(message).currentMessageEmergency,false);
  assert.doesNotMatch(currentSafetyClauses(message).map(c=>c.text).join(" "),/collapsed|cannot breathe/);
  assert.match(safetyTemporalScope(message).currentText,/River is eating now/);
 }
});
test("current assertions, uncertainty and correction keep owner evidence semantics",()=>{
 for(const message of ["River likes blue blankets.","I think River may be struggling to breathe now.","Correction, River weighs 4 kg."]){
  assert.equal(analyzeOwnerAssertions(message).hasOwnerAssertion,true,message);
 }
 assert.equal(analyzeOwnerAssertions("Correction, River weighs 4 kg.").hasExplicitCorrection,true);
 assert.equal(analyzeOwnerAssertions("I think River may be struggling to breathe now.").assertionSpans[0].isUncertain,true);
 assert.equal(analyzeOwnerAssertions(quote+"River weighs 4 kg."+quote).hasOwnerAssertion,false);
});
test("safety state delegates immediate emergency authority to the shared detector",()=>{
 const source=readFileSync(new URL("../app/lib/intelligence/safety-state.ts",import.meta.url),"utf8");
 assert.match(source,/const immediateEmergency = detectImmediateAskEmergency\(context.currentMessage\)/);
 assert.match(source,/currentMessageEmergency: Boolean\(immediateEmergency\)/);
 assert.doesNotMatch(source,/const immediateEmergency\s*=\s*\//);
});

const {ownerAssertionProposition,isOwnerCertainEvidence}=await import("../app/lib/ai/owner-assertion.ts");
for(const [message,expected] of [
 ["I think River cannot breathe right now.",true],
 ["I suspect River collapsed.",true],
 ["We think River cannot breathe.",true],
 ["Maybe River cannot breathe.",true],
 ["I think River is fine.",false],
 ["I cannot breathe after my run.",false],
 ["I think I cannot breathe.",false],
 ["We cannot breathe.",false],
 ["My child is gasping.",false],
 ["A person collapsed.",false],
 ["I cannot breathe and Luna is having a seizure.",true],
 ["Clover cannot breathe beside my child.",true],
])test("embedded proposition patient: "+message,()=>{
 assert.equal(state(message).currentMessageEmergency,expected);
 assert.equal(Boolean(detectImmediateAskEmergency(message)),expected);
});
for(const [open,close] of [[quote,quote],[String.fromCharCode(0x201c),String.fromCharCode(0x201d)],[String.fromCharCode(0x2018),String.fromCharCode(0x2019)]]){
 for(const [prefix,quoted,suffix,expected] of [
  ["The article says ","River collapsed and cannot breathe.","",false],
  ["The article says ","dogs can collapse."," River cannot breathe right now.",true],
  ["The article says ","dogs can collapse."," River is eating normally.",false],
  ["","The dog cannot breathe.","",false],
  ["She said ","River collapsed."," River collapsed now.",true],
 ])test("original quote boundaries "+open+prefix+suffix,()=>{
  const message=prefix+open+quoted+close+suffix;
  assert.equal(state(message).currentMessageEmergency,expected);
  assert.ok(!safetyTemporalScope(message).currentText.includes(quoted));
  if(suffix)assert.ok(safetyTemporalScope(message).currentText.includes(suffix.trim()));
 });
}
test("proposition spans remain exact source slices without changing assertion evidence",()=>{
 for(const text of ["I think River is limping.","I suspect River ate something.","We believe River is uncomfortable.","I"+String.fromCharCode(0x2019)+"m not sure River can breathe normally."]){
  const before=analyzeOwnerAssertions(text);
  const snapshot=structuredClone(before);
  const span=before.clauseSpans[0],proposition=ownerAssertionProposition(span);
  assert.match(proposition.text,/^River /);
  assert.equal(text.slice(proposition.start,proposition.end),proposition.text);
  assert.deepEqual(before,snapshot);
  assert.equal(span.text,text);
  assert.equal(proposition.end,span.end);
 }
 const text="I think River is limping.";
 assert.equal(isOwnerAssertedEvidence(text,"River is limping"),true);
 assert.equal(isOwnerCertainEvidence(text,"River is limping"),false);
 const conditional="What if River is limping?";
 assert.equal(isOwnerAssertedEvidence(conditional,"River is limping"),false);
 const quoted=quote+text+quote;
 assert.equal(isOwnerAssertedEvidence(quoted,"River is limping"),false);
});

test("uncertain proposition cannot certify recovery from preceding current distress",()=>{
 const message="River cannot breathe. I think River is breathing normally.";
 assert.equal(state(message).currentMessageEmergency,true);
 assert.ok(detectImmediateAskEmergency(message));
});
