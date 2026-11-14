import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {supplementCandidates,evidenceCompletionSchema,parseEvidenceCompletion,verifySingleReferenceResult,applyReferenceCompletion,applySourceReview} from "../app/lib/ask-read-only/evidence-completion.mjs";
const body="A few coat mats were removed during grooming. Skin underneath looked normal.";
const row={kind:"history",id:"owned-note",ownerId:"owner",petId:"pet",body,eventAt:"2020-02-15T12:00:00Z",recordedAt:"2020-02-16T12:00:00Z",handle:"s1"};
const pet={id:"pet",handle:"p1",ownerId:"owner",name:"Willow"};
const request={kind:"history",pet,reference:"r1",expectedSources:[{id:row.id,hash:createHash("sha256").update(body).digest("hex"),eventAt:row.eventAt,recordedAt:row.recordedAt}]};
const refs=[{handle:"r1",request}];
const brief={id:"t1",kind:"vet_brief",needsHistory:false,recordMode:"none",pets:["p1"],missing:["medicine"]};
const question="Please include the old note in this brief.";
const context={question,pets:[pet,{id:"another",handle:"p2",name:"Maple",ownerId:"owner"}]};
const candidates=()=>supplementCandidates([brief],refs,true,context);
const wire=(patch={})=>({sources:[],completion:[{task:"t1",status:"partial",reason:"missing_context",sources:[],historyFacts:[],ownerFacts:[],historySynthesis:[]}],evidenceCompletion:{sourceReview:[],missingReference:{task:"t1",reference:"r1",requestExcerpt:question}},...patch});

test("late selection requires zero prior reads, one matching owned pet and exactly one single-source reference",()=>{
 assert.equal(candidates().length,1);
 assert.deepEqual(supplementCandidates([brief],refs,false,context),[]);
 assert.deepEqual(supplementCandidates([brief],[...refs,{handle:"r2",request}],true,context),[]);
 assert.deepEqual(supplementCandidates([brief],[{handle:"r1",request:{...request,expectedSources:[...request.expectedSources,...request.expectedSources]}}],true,context),[]);
 for(const text of ["Include Maple's old note.","Include Willow and Maple's old notes.","Use Willow's March 2022 report.","Use Willow's 2022 report instead."]){
  assert.deepEqual(supplementCandidates([brief],refs,true,{...context,question:text}),[]);
 }
 assert.deepEqual(supplementCandidates([{...brief,pets:[]}],refs,true,context),[]);
 assert.deepEqual(supplementCandidates([brief],[{handle:"r1",request:{...request,discoveryIncomplete:true}}],true,context),[]);
});
test("supplement request must quote the current owner request and match a permitted task/reference",()=>{
 const out=parseEvidenceCompletion(wire(),[brief],[],candidates(),question);
 assert.equal(out.supplement.reference,"r1");assert.ok(!Object.hasOwn(out.value,"evidenceCompletion"));
 for(const patch of [{reference:"foreign"},{task:"t2"},{requestExcerpt:"An invented owner request."}]){
  const bad=wire();Object.assign(bad.evidenceCompletion.missingReference,patch);
  assert.throws(()=>parseEvidenceCompletion(bad,[brief],[],candidates(),question),/ASK_READ_COMPONENT_CONTRACT/);
 }
 assert.throws(()=>parseEvidenceCompletion(wire(),[brief],[],[],question),/ASK_READ_COMPONENT_CONTRACT/);
});
test("fresh single-reference proof rejects changed identity, owner, pet, body, instants and partial data",()=>{
 const result={sources:[row],scopeExhausted:true};
 assert.doesNotThrow(()=>verifySingleReferenceResult(request,result,"owner"));
 for(const patch of [{id:"foreign"},{ownerId:"foreign"},{petId:"foreign"},{kind:"profile"},{body:"Changed saved text."},{eventAt:"2021-02-15T12:00:00Z"},{recordedAt:"2021-02-16T12:00:00Z"}]){
  assert.throws(()=>verifySingleReferenceResult(request,{...result,sources:[{...row,...patch}]},"owner"),/ASK_READ_COMPONENT_CONTRACT/);
 }
 for(const patch of [{hasMore:true},{truncated:true},{staleReference:true},{unavailable:true},{scopeExhausted:false},{sources:[row,row]}]){
  assert.throws(()=>verifySingleReferenceResult(request,{...result,...patch},"owner"),/ASK_READ_COMPONENT_CONTRACT/);
 }
 assert.doesNotThrow(()=>verifySingleReferenceResult(request,{sources:[],staleReference:true},"owner"));
});
test("literal brief recovery copies only a newly admitted full source and preserves missing medical authority",()=>{
 const parsed=parseEvidenceCompletion(wire(),[brief],[],candidates(),question);
 const supplied=applyReferenceCompletion(parsed.value,[brief],parsed.supplement,[row]);
 assert.equal(supplied.available,true);assert.deepEqual(supplied.plan[0].missing,["medicine"]);
 assert.equal(supplied.value.completion[0].historyFacts[0].excerpt,body);assert.equal(supplied.value.completion[0].status,"partial");
 for(const sources of [[],[{...row,body:"x".repeat(281)}]]){
  const unavailable=applyReferenceCompletion(parsed.value,[brief],parsed.supplement,sources);
  assert.equal(unavailable.available,false);assert.deepEqual(unavailable.value.completion[0].historyFacts,[]);assert.equal(unavailable.value.completion[0].status,"partial");
 }
});
const collection={...brief,kind:"saved_content",needsHistory:true,recordMode:"collection"};
const answer=()=>({sources:["s1"],completion:[{task:"t1",status:"complete",reason:"none",sources:["s1"],historyFacts:[],historySynthesis:[{topic:"coat mats",evidence:[{source:"s1",excerpt:body}]}]}]});
test("source review must cover exactly the admitted collection catalogue without duplicate or forged handles",()=>{
 const schema=evidenceCompletionSchema([collection],[row],[]);
 assert.equal(schema.properties.sourceReview.type,"object");assert.equal(schema.properties.sourceReview.properties.routine.maxItems,1);
 for(const sourceReview of [[],[{source:"forged",classification:"noteworthy"}],[{source:"s1",classification:"unsupported"}],[{source:"s1",classification:"routine"},{source:"s1",classification:"noteworthy"}]]){
  assert.throws(()=>parseEvidenceCompletion({...answer(),evidenceCompletion:{sourceReview,missingReference:null}},[collection],[row],[],question),/ASK_READ_COMPONENT_CONTRACT/);
 }
});
test("noteworthy recovery retains complete original negation and condition, clears duplicate theme text and adds no pattern claims",()=>{
 for(const text of [body,"No itching was reported.","If itching returns, the owner will contact the veterinarian."]){
  const s={...row,body:text},review=[{source:"s1",classification:"noteworthy"}];
  const out=applySourceReview(answer(),[collection],[s],review);
  assert.equal(out.value.completion[0].historyFacts[0].excerpt,text);assert.deepEqual(out.value.completion[0].historySynthesis,[]);
  assert.equal(out.recovered,1);assert.equal(out.unrendered,0);
 }
});
test("source review cannot borrow another task's source or exceed the existing six-fact limit",()=>{
 const rows=Array.from({length:7},(_,i)=>({...row,handle:"s"+(i+1),id:"n"+i}));
 const value=answer();value.sources=rows.map(r=>r.handle);value.completion[0].sources=[...value.sources];
 const out=applySourceReview(value,[collection],rows,rows.map(r=>({source:r.handle,classification:"noteworthy"})));
 assert.equal(out.value.completion[0].historyFacts.length,6);assert.equal(out.unrendered,1);assert.equal(out.value.completion[0].status,"partial");
 const other=applySourceReview(answer(),[collection],[{...row,handle:"s2"}],[{source:"s2",classification:"noteworthy"}]);
 assert.equal(other.recovered,0);assert.deepEqual(other.value.completion[0].historyFacts,[]);
});

test("compact collection review partitions all32 sources without per-row object overhead",()=>{
 const rows=Array.from({length:32},(_,i)=>({...row,id:"note"+i,handle:"s"+(i+1)}));
 const sourceReview={routine:rows.slice(1).map(s=>s.handle),noteworthy:["s1"],uncertain:[],irrelevant:[]};
 const schema=evidenceCompletionSchema([collection],rows,[]).properties.sourceReview;
 assert.equal(schema.type,"object");assert.deepEqual(schema.required,["routine","noteworthy","uncertain","irrelevant"]);
 const out=parseEvidenceCompletion({...answer(),evidenceCompletion:{sourceReview,missingReference:null}},[collection],rows,[],question);
 assert.equal(out.review.length,32);assert.equal(out.review.find(x=>x.source==="s1").classification,"noteworthy");
 const legacy=rows.map(s=>({source:s.handle,classification:s.handle==="s1"?"noteworthy":"routine"}));
 assert.ok(JSON.stringify(sourceReview).length<JSON.stringify(legacy).length/2);
 for(const bad of [{...sourceReview,routine:sourceReview.routine.slice(1)},{...sourceReview,uncertain:["s1"]},{...sourceReview,noteworthy:["foreign"]},{...sourceReview,other:[]}]){
  assert.throws(()=>parseEvidenceCompletion({...answer(),evidenceCompletion:{sourceReview:bad,missingReference:null}},[collection],rows,[],question),/ASK_READ_COMPONENT_CONTRACT/);
 }
 const empty=parseEvidenceCompletion({...answer(),evidenceCompletion:{sourceReview:{routine:[],noteworthy:[],uncertain:[],irrelevant:[]},missingReference:null}},[brief],[],[],question);
 assert.deepEqual(empty.review,[]);
});

test("routine facts disappear only when all their nonmeasurement wording is already quoted",()=>{
 const routine="Routine reports described usual activity.",base={...row,petName:"Maple",body:"Maple weighed 4.00 kg. "+routine};
 const value=answer();value.completion[0].historyFacts=[{source:"s1",excerpt:base.body}];value.completion[0].historySynthesis=[{topic:"usual activity",evidence:[{source:"s1",excerpt:routine}]}];
 const reviewed=applySourceReview(value,[collection],[base],[{source:"s1",classification:"routine"}]);
 assert.deepEqual(reviewed.value.completion[0].historyFacts,[]);assert.equal(reviewed.value.completion[0].historySynthesis.length,1);
 for(const body of ["Maple weighed 4.00 kg after a stressful incident. "+routine,base.body+" One brief concern was reported and resolved."]){
  const v=structuredClone(value);v.completion[0].historyFacts[0].excerpt=body;
  const kept=applySourceReview(v,[collection],[{...base,body}],[{source:"s1",classification:"routine"}]);
  assert.equal(kept.value.completion[0].historyFacts[0].excerpt,body);
 }
});
test("collection salience never removes independently requested single-note or vet-brief facts",()=>{
 for(const kind of ["saved_content","vet_brief"]){
  const t={...collection,kind,recordMode:"single"},v=answer();v.completion[0].historyFacts=[{source:"s1",excerpt:body}];
  const out=applySourceReview(v,[t],[row],[{source:"s1",classification:"routine"}]);assert.deepEqual(out.value.completion[0].historyFacts,v.completion[0].historyFacts);
 }
});
