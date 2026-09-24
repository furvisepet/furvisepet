import assert from "node:assert/strict";
import test from "node:test";
import {exercise,clock,ASK_PROMPT_CONTEXT_CHAR_BUDGET,evidenceScopeKey} from "./helpers/lifetime-harness.mjs";
import {uncertifiedRead,certifiedRows} from "./helpers/evidence-publication-fixture.mjs";
import {care,decisive,irrelevant,ownerId} from "./fixtures/ask-lifetime-history.mjs";

// Legacy evidence proposals remain diagnostic fixture inputs only. They cannot
// mint a canonical ticket or certify any factual answer.
const evidenceRead=(kind,{terms=[],topics=[],from=null,to=null,period={kind:"unspecified",surface:null},status="resolved",locator=null}={})=>({
 read:{operation:kind==="comparison"?"compare":"read",temporal:{from,to,anchor:null},predicates:terms.length?[{kind:"text_any",terms}]:[],
 outputs:{completeness:["count","absence","comparison","overview"].includes(kind)?"exhaustive":"sufficient",ordering:"asc",limit:null}},
 kind,topics,period,status,locator});
const lookup=(terms,{year=null,label="September 3",ambiguous=false}={})=>evidenceRead("record_lookup",{terms,locator:{intent:"source",status:ambiguous?"ambiguous":"resolved",date:{year,month:9,day:3,label}}});
const effectiveLookup=()=>evidenceRead("record_lookup",{locator:{intent:"effective",status:"resolved",date:null}});
const sourceFree=run=>{
 assert.deepEqual(run.response.relevantContextIds,[]);assert.deepEqual(run.response.referencedRecords,[]);
 assert.deepEqual(run.response.applicationActions,[]);assert.deepEqual(run.response.careActions,[]);
 assert.deepEqual(run.response.semanticEvents,[]);assert.deepEqual(run.response.learnings,[]);
 assert.equal(run.response.proposedHistoryUpdate.shouldOffer,false);
 assert.equal(run.response.labsList,undefined);assert.equal(run.response.profileFieldLabs,undefined);
};
const exactRows=(run,rows)=>{
 assert.equal(run.response.model,"server-labs-list");
 assert.deepEqual(run.response.relevantContextIds,rows.map(r=>"care:"+r.id));
 assert.deepEqual(run.response.labsList.records.map(r=>[r.id,r.petId,r.body,r.event_at]),rows.map(r=>[r.id,r.pet_profile_id,r.note,r.occurred_at]));
 for(const row of rows)assert.ok(run.response.answer.summary.includes(JSON.stringify(row.note)));
 assert.equal(run.validation.valid,true);
};

for(const note of ["September 3 urine test: result normal.","September 3 vet note: skin diagnosis recorded."])
 test("named blood test cannot cite unrelated uncertified note: "+note,async t=>{
  clock(t);const run=await uncertifiedRead("What did Luna's September 3 blood-test result say?",{evidenceReadProposal:lookup(["blood test","blood result"]),petId:"luna",rows:[care("specific","luna","2026-09-03","vet_visit",note)]});
  sourceFree(run);assert.ok(!run.response.answer.summary.includes(note));
 });
for(const [topic,note]of [["blood","September 3 blood test: result pending, not confirmed normal."],["urine","I recorded the urine test as pending."],["urine","I added the urine test result: pending, not normal."],["urine","I recorded the urine test value as 2.7, with uncertainty."]])
 test("certified source wording survives unchanged: "+note,async t=>{
  clock(t);const rows=[care("specific","luna","2026-09-03","vet_visit",note)];
  const run=await certifiedRows(rows,{petId:"luna",terms:[topic+" test",topic+" result"]});exactRows(run,rows);
 });
test("ordinary assistant persistence claims remain removed, even inside model quotation marks",async t=>{
 clock(t);const run=await exercise("How should I brush Luna?",{petId:"luna",answer:'Use a soft brush. "I added a grooming note." I recorded this in history.'});
 assert.match(run.result.reasoning.answer.summary,/soft brush/);assert.doesNotMatch(run.result.reasoning.answer.summary,/I added|I recorded/);assert.deepEqual(run.result.reasoning.referencedRecords,[]);
});
for(const topic of ["test","blood and urine test"])test("ambiguous legacy locator grants no factual authority: "+topic,async t=>{
 clock(t);const run=await uncertifiedRead("What did Luna's September 3 "+topic+" result say?",{evidenceReadProposal:lookup([],{ambiguous:true}),petId:"luna",rows:[care("specific","luna","2026-09-03","vet_visit","Urine test: pending.")]});sourceFree(run);
});
test("typed compound predicates retain every requested component",async t=>{
 clock(t);const wrong=care("kidney","luna","2026-09-03","vet_visit","Kidney function test: pending.");
 const right=care("liver","luna","2026-09-03","vet_visit","Liver function test: pending, interpretation uncertain.");
 const run=await certifiedRows([wrong,right],{petId:"luna",terms:["liver function test","liver function result"]});
 exactRows(run,[right]);assert.doesNotMatch(run.response.answer.summary,/Kidney/);
});
for(const [petId,note,terms]of [
 ["luna","September 3 urine test: result pending.",["urine test","urine result"]],
 ["luna","September 3 urine test: result normal.",["urine test","urine result"]],
 ["oscar","September 3 vet note: the veterinarian recorded a diagnosis of arthritis, not yet confirmed by imaging.",["diagnosis","diagnoses"]]])
 test("qualified certified note reaches final answer: "+note,async t=>{
  clock(t);const rows=[care("specific",petId,"2026-09-03","vet_visit",note)];exactRows(await certifiedRows(rows,{petId,terms}),rows);
 });
test("certified source rendering needs no model citation or factual generation",async t=>{
 clock(t);const rows=[care("specific","luna","2026-09-03","vet_visit","Urine test: result pending, not confirmed normal.")];
 const run=await certifiedRows(rows,{petId:"luna",terms:["urine test","urine result"],from:"2026-09-03T00:00:00Z",to:"2026-09-04T00:00:00Z"});
 exactRows(run,rows);assert.deepEqual(run.response.applicationActions,[]);
});
test("unselected competing evidence cannot be repaired into a quote without closure proof",async t=>{
 clock(t);const original=care("specific","luna","2026-09-03","vet_visit","Urine test: pending."),later=care("later","luna","2026-09-04","vet_visit","Urine test correction: abnormal.");
 const run=await uncertifiedRead("What did Luna's September 3 urine-test result say?",{evidenceReadProposal:lookup(["urine test","urine result"]),petId:"luna",rows:[original,later],prepareContext(c){c.selectedCareEntries=[original];}});
 sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/pending|abnormal/);
 const earlier=care("earlier","luna","2026-09-02","vet_visit","Urine test: normal.");
 exactRows(await certifiedRows([earlier,original],{petId:"luna",terms:["urine test"],from:"2026-09-03T00:00:00Z",to:"2026-09-04T00:00:00Z"}),[original]);
});
test("a valid eligible ID for another topic cannot authorize a requested result",async t=>{
 clock(t);const run=await uncertifiedRead("What did Luna's September 3 urine-test result say?",{evidenceReadProposal:lookup(["urine test","urine result"]),petId:"luna",rows:[care("specific","luna","2026-09-03","vet_visit","Vet note: recorded diagnosis of a skin allergy.")]});
 sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/normal|skin allergy/);
});
test("typed explicit year disambiguates dates without publisher date inference",async t=>{
 clock(t);const older=care("old","luna","2025-09-03","vet_visit","Urine test: normal."),selected=care("specific","luna","2026-09-03","vet_visit","Urine test: result pending.");
 exactRows(await certifiedRows([older,selected],{petId:"luna",terms:["urine test"],from:"2026-09-03T00:00:00Z",to:"2026-09-04T00:00:00Z"}),[selected]);
});
for(const [label,options]of [
 ["missing",{rows:[]}],["unavailable",{failCare:true}],
 ["ambiguous same day",{rows:[care("a","luna","2026-09-03","vet_visit","Urine test: pending."),care("b","luna","2026-09-03","vet_visit","Urine test: normal.")]}],
 ["ambiguous year",{rows:[care("a","luna","2025-09-03","vet_visit","Urine test: pending."),care("b","luna","2026-09-03","vet_visit","Urine test: normal.")]}],
 ["later contradiction",{rows:[care("a","luna","2026-09-03","vet_visit","Urine test: normal."),care("b","luna","2026-09-04","vet_visit","Correction: September 3 urine test result was abnormal, not normal.")]}],
 ["oversized",{rows:[care("a","luna","2026-09-03","vet_visit","Urine test: "+"background ".repeat(100)+"result pending, not normal.")]}]])
 test("uncertified lookup stays source-free: "+label,async t=>{
  clock(t);const run=await uncertifiedRead("What did Luna's September 3 urine-test result say?",{evidenceReadProposal:lookup(["urine test","urine result"]),petId:"luna",...options});sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/test was normal/);
 });
test("a dated row cannot establish current status, exhaustive absence, or a count",async t=>{
 clock(t);for(const kind of ["record_lookup","absence","count"]){const run=await uncertifiedRead("A typed historical obligation.",{evidenceReadProposal:kind==="record_lookup"?effectiveLookup():evidenceRead(kind),petId:"luna",rows:[care("specific","luna","2026-09-03","vet_visit","Urine test: normal.")]});sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/always|never|normal/);}
});
for(const [petId,question,forbidden,kind]of [
 ["milo","How many soft-stool episodes are recorded?",/seven/,"count"],
 ["luna","What was Luna urine-test result?",/test was normal/,"record_lookup"],
 ["oscar","What is Oscar diagnosis?",/arthritis/,"record_lookup"],
 ["milo","Compare Milo earliest and latest weight.",/0\.2 kg/,"comparison"]])
 test("uncertified obligation rejects reconstructed answer: "+question,async t=>{
  clock(t);const run=await uncertifiedRead(question,{petId,evidenceReadProposal:kind==="record_lookup"?effectiveLookup():evidenceRead(kind)});sourceFree(run);assert.doesNotMatch(JSON.stringify(run.response.answer),forbidden);assert.deepEqual(run.response.answer.sections,[]);
 });
test("small successful loading is not effective-history completeness",async t=>{
 clock(t);const run=await uncertifiedRead("What weight was reported for Milo on August 19?");
 assert.deepEqual(run.evidence.scope.authorizedPetIds,["milo"]);
 for(const dimension of ["retrieval","corrections","extraction","grouping"])assert.equal(run.evidence.completeness[dimension],"unknown");
 sourceFree(run);
});
test("capped loader diagnostics remain distinct from publication transport",async t=>{
 clock(t);const run=await uncertifiedRead("Summarize Milo entire recorded history.",{rows:[...decisive,...irrelevant("milo")],evidenceReadProposal:evidenceRead("overview",{period:{kind:"lifetime",surface:"entire recorded history"}})});
 const source=run.evidence.sources.find(s=>s.petId==="milo"&&s.source==="care_entries");
 assert.equal(source.status,"capped");assert.equal(source.loadedIds.length,80);sourceFree(run);
 assert.doesNotMatch(run.response.answer.summary,/complete lifetime history/);
});
for(const [question,kind]of [["How many separate soft-stool episodes has Milo ever had?","count"],["Has Milo ever vomited?","absence"],["Have I reported any vomiting for Milo?","absence"],["Compare all Milo recorded weights.","comparison"]])
 test("unknown coverage cannot authorize exhaustive answer: "+question,async t=>{
  clock(t);const run=await uncertifiedRead(question,{evidenceReadProposal:evidenceRead(kind)});sourceFree(run);assert.equal(run.evidence.completeness.retrieval,"unknown");
 });
test("failed loading stays internal and cannot become definitive absence",async t=>{
 clock(t);const run=await uncertifiedRead("What was Luna urine-test result?",{evidenceReadProposal:effectiveLookup(),petId:"luna",failCare:true});
 const source=run.evidence.sources.find(s=>s.source==="care_entries");assert.equal(source.status,"unavailable");assert.ok(source.reasons.includes("source_unavailable"));sourceFree(run);
 assert.doesNotMatch(run.response.answer.summary,/There is no recorded/);
});
test("profile-only second pet does not imply history loading",async t=>{
 clock(t);const run=await uncertifiedRead("Summarize Milo and Luna history.",{authoritativePetIds:["milo","luna"],evidenceReadProposal:evidenceRead("overview")});
 assert.equal(run.evidence.sources.find(s=>s.petId==="luna"&&s.source==="care_entries").status,"not_loaded");sourceFree(run);
});
test("a long qualified source survives certified Labs whole rather than a model span budget",async t=>{
 clock(t);const note="Owner described the surroundings. ".repeat(22)+"Correction: Bruno vomited, not Milo. Milo may have had nausea; weight was 27.8 kg.";
 const rows=[care("qualified","milo","2026-08-20","symptom",note)];exactRows(await certifiedRows(rows),rows);
});
function counterfeitCoverage(e){for(const s of e.sources){s.status="loaded";s.reasons=[];s.completeness={retrieval:"complete",corrections:"complete",extraction:"complete",grouping:"complete"};}}
const twoReports=[care("one","milo","2026-08-18","symptom","First soft-stool episode."),care("two","milo","2026-08-19","symptom","Second separate soft-stool episode.")];
test("handwritten completeness and verifiedFacts cannot mint a count certificate",async t=>{
 clock(t);const run=await uncertifiedRead("How many episodes are recorded?",{evidenceReadProposal:evidenceRead("count"),rows:twoReports,prepareEvidence(e){
 counterfeitCoverage(e);e.verifiedFacts=[{scopeKey:evidenceScopeKey(e.scope),kind:"count",sourceIds:["care:one","care:two"],text:"Two separate episodes are recorded."}];}});
 sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/Two separate|seven/);
});
test("incomplete legacy metadata cannot authorize a count either",async t=>{
 clock(t);for(const missing of ["corrections","extraction","grouping","fact"]){const run=await uncertifiedRead("How many episodes?",{rows:twoReports,evidenceReadProposal:evidenceRead("count"),prepareEvidence(e){counterfeitCoverage(e);if(missing!=="fact"){e.sources[0].completeness[missing]="unknown";e.verifiedFacts=[{scopeKey:evidenceScopeKey(e.scope),kind:"count",sourceIds:["care:one"],text:"Seven episodes."}];}}});sourceFree(run);}
});
test("provider-proposed coverage never participates in factual authority",async t=>{
 clock(t);const run=await uncertifiedRead("How many episodes?",{evidenceReadProposal:evidenceRead("count"),providerOverrides:{evidenceContract:{completeness:{retrieval:"complete"},verifiedFacts:[{text:"Seven episodes."}]}}});
 assert.equal(run.evidence.completeness.retrieval,"unknown");assert.deepEqual(run.evidence.verifiedFacts,[]);sourceFree(run);
});
test("qualified source plus a legacy verifiedFact still cannot authorize an extracted total",async t=>{
 clock(t);const note="Owner described context. ".repeat(35)+"Only two episodes, uncertain grouping.";
 const run=await uncertifiedRead("How many episodes?",{rows:[care("long-proof","milo","2026-08-19","symptom",note)],evidenceReadProposal:evidenceRead("count"),prepareEvidence(e){counterfeitCoverage(e);e.verifiedFacts=[{scopeKey:evidenceScopeKey(e.scope),kind:"count",sourceIds:["care:long-proof"],text:"Two episodes."}];}});sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/Two episodes/);
});
test("actual loader scope excludes unauthorized pet IDs without granting legacy topics authority",async t=>{
 clock(t);const run=await uncertifiedRead("Summarize Milo weight and medication history.",{evidenceReadProposal:evidenceRead("overview",{topics:["weight","medication"],from:"2014-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z"}),authoritativePetIds:["milo","not-owned"]});
 assert.deepEqual(run.evidence.scope.authorizedPetIds,["milo"]);sourceFree(run);
});
test("ambiguous episode references cannot reconstruct an ordinal fact",async t=>{
 clock(t);const run=await uncertifiedRead("What about the second episode?",{evidenceReadProposal:evidenceRead("ordinary",{status:"ambiguous"})});sourceFree(run);assert.doesNotMatch(run.response.answer.summary,/vomiting in 2014/);
});
test("qualified short source survives exactly in certified transport",async t=>{
 clock(t);const rows=[care("qualified-small","milo","2026-08-19","weight","On Aug. 19 Milo weighed 27.8 kg. He may have had nausea, not vomiting; Bruno vomited.")];exactRows(await certifiedRows(rows,{terms:["weighed"]}),rows);
});
test("date-filtered loading does not certify corrections for the requested period",async t=>{
 clock(t);const run=await uncertifiedRead("Summarize all history in 2014.",{evidenceReadProposal:evidenceRead("overview",{from:"2014-01-01T00:00:00Z",to:"2015-01-01T00:00:00Z"}),dateRange:{from:"2014-01-01",to:"2014-12-31"}});
 assert.deepEqual(run.evidence.sources.find(s=>s.source==="care_entries").loadedPeriod,{from:"2014-01-01",to:"2014-12-31"});assert.equal(run.evidence.completeness.corrections,"unknown");sourceFree(run);
});
test("untyped resolved-state preload cannot spend factual prompt budget",async t=>{
 clock(t);const run=await exercise("How can a calm routine help?",{prepareContext(c){c.recentlyResolvedConcerns=[{id:"large",pet_profile_id:"milo",title:"Old concern",normalized_key:"old",status:"resolved",resolved_at:"2026-09-03",resolution_note:"x".repeat(38000)}];}});
 assert.ok(run.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);assert.doesNotMatch(run.serialized,/x{100}/);assert.deepEqual(run.result.reasoning.relevantContextIds,[]);
});
test("oversized mandatory scope fails before provider instead of deleting scope",async t=>{
 clock(t);await assert.rejects(exercise("Summarize Milo entire history. "+"context ".repeat(9000)),/ASK_EVIDENCE_SCOPE_EXCEEDS_BUDGET/);
});
test("proofless factual recall cannot become new history or memory",async t=>{
 clock(t);const run=await uncertifiedRead("How many episodes did I report?",{evidenceReadProposal:evidenceRead("count")});sourceFree(run);assert.equal(run.evidence.scope.readOnlyRecall,true);
});
test("explicit USER-note save preserves its existing owner assertion provenance",async t=>{
 clock(t);const run=await exercise("Please save this in history.",{messages:[{id:"prior-observation",role:"user",user_text:"Milo weighs 27.8 kg today.",sequence_number:1,user_id:ownerId,conversation_id:"chat",created_at:"2026-09-04T10:00:00Z"}]});
 assert.equal(run.result.reasoning.evidenceContract.scope.readOnlyRecall,false);assert.ok(run.result.acceptedCareActions.some(action=>action.details.includes("27.8 kg")));
 const mixed=await exercise("Milo stopped vomiting today. How many episodes have I reported?");assert.equal(mixed.result.reasoning.evidenceContract.scope.readOnlyRecall,false);
});
test("current emergency guidance survives incomplete historical preload",async t=>{
 clock(t);const run=await exercise("Milo collapsed. How many vomiting episodes have I reported?",{answer:"Contact an emergency veterinarian now."});
 assert.equal(run.result.safety.currentMessageEmergency,true);assert.equal(run.result.reasoning.safetyLevel,"urgent");assert.match(run.result.reasoning.answer.summary,/emergency veterinarian/i);
});
