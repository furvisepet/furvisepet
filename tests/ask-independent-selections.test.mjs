import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { groundReadProbes } from "../app/lib/intelligence/read-probes.ts";
import { bindTypedReadTicket } from "../app/lib/furvise-brain/typed-read-ticket.ts";
import { retrieveReadTicket } from "../app/lib/furvise-brain/lungs.ts";
import { selectionPublication } from "../app/lib/intelligence/selection-publication.ts";
import { derivePublicationAuthority, publicationClaimFailures } from "../app/lib/intelligence/publication-authority.ts";
import { buildLabsList, labsTaskComplete, serializeLabsList } from "../app/lib/intelligence/labs-list.ts";
import { calculationEffectiveStore } from "./helpers/calculation-effective-store.mjs";
import { ASK_REQUEST_INSTRUCTIONS } from "../app/lib/intelligence/ask-request-contract.ts";
import { POLICY_BUNDLE } from "../app/lib/intelligence/ask-wire-policy.generated.mjs";

const pets=[{id:"fern",name:"Juniper",user_id:"owner"},{id:"reed",name:"Quill",user_id:"owner"}];
const question="First meal for Juniper in May; last mass for Quill in June.";
const scope={userId:"owner",ownedPetIds:pets.map(p=>p.id),from:"2020-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-10-03T12:00:00Z"};
const selected=direction=>({groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction}],take:{count:1,per:"group"}}]});
const probes=()=>[
 {quote:"First meal for Juniper in May",sourceTurnId:null,petNames:["Juniper"],from:"2024-05-01T00:00:00Z",to:"2024-06-01T00:00:00Z",target:"2024-05",termGroups:[["meal"]],ordering:"asc",predicates:[{kind:"text_any",terms:["meal"]}],selection:selected("asc")},
 {quote:"last mass for Quill in June",sourceTurnId:null,petNames:["Quill"],from:"2024-06-01T00:00:00Z",to:"2024-07-01T00:00:00Z",target:"2024-06",termGroups:[["mass"]],ordering:"desc",predicates:[{kind:"text_any",terms:["mass"]}],selection:selected("desc")},
];
const source=(id,pet,at,note,saved=at)=>({id,user_id:"owner",pet_profile_id:pet,note,title:null,severity:null,category:"general",deleted_at:null,occurred_at:at,created_at:saved,updated_at:saved});
const rows=()=>[
 source("fern-first","fern","2024-05-02T09:00:00Z","meal 31 g","2026-01-02T11:00:00Z"),
 source("reed-same-time","reed","2024-05-02T09:00:00Z","meal 98 g"),
 source("fern-later","fern","2024-05-25T09:00:00Z","meal 33 g"),
 source("reed-first","reed","2024-06-02T09:00:00Z","mass 4.1 kg"),
 source("reed-last","reed","2024-06-25T09:00:00Z","mass 4.3 kg","2025-12-01T10:00:00Z"),
 source("fern-other","fern","2024-06-25T09:00:00Z","mass 15 kg"),
 source("reed-outside","reed","2024-07-01T00:00:00Z","mass 6 kg"),
];
function bind(input=probes()){
 const grounded=groundReadProbes(input,{currentMessage:question,currentTurn:{id:"turn"},conversationTurns:[]},[],pets);
 const ticket=bindTypedReadTicket({authority:"effective_fact",operation:"read",temporal:{from:null,to:null,anchor:null},predicates:[],selection:null,
  needs:grounded.needs,outputs:{completeness:"sufficient",ordering:"desc",limit:null}},scope.ownedPetIds,grounded.bindings);
 const needs=grounded.evidenceNeeds.map(n=>{const typed=ticket.needs.find(t=>t.id===n.id);return {...n,window:{from:typed.from,to:typed.to}};});
 return {ticket,needs};
}
async function fixture({input=probes(),sourceRows=rows(),graph={}}={}){
 const {ticket,needs}=bind(input),store=calculationEffectiveStore(sourceRows,graph,pets);
 const result=await retrieveReadTicket(ticket,scope,store.store);
 const evidence={version:"ask-evidence.v1",petNames:Object.fromEntries(pets.map(p=>[p.id,p.name])),
  scope:{authorizedPetIds:scope.ownedPetIds,status:"resolved",readOnlyRecall:true},
  interpretation:{operation:"recall",readOperation:"recall",request:{mode:"read",evidenceBasis:"saved_history",readTicket:ticket,evidenceNeeds:needs,quantity:"records",requirements:[],profileFields:[]}},
  history:{ticketCoverage:result.coverage,provenance:[],candidateIds:result.records.map(r=>"care:"+r.id),eventCandidateIds:[],needs:[]},
  sources:[],represented:[],losses:[],verifiedFacts:[],representation:"complete"};
 return {ticket,needs,store,result,evidence};
}
const transport=f=>f.result.records.map(r=>({id:r.id,petId:r.pet_profile_id}));
test("independent windows and overlapping timestamps preserve both certified endpoints",async()=>{
 const f=await fixture(),p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,true);assert.equal(p.certificates.length,2);
 assert.deepEqual(p.certificates.map(c=>[c.subjectId,c.selectedEventIds]),[["fern",["fern-first"]],["reed",["reed-last"]]]);
 assert.ok(f.store.pages.every(q=>q.petId==="fern"?q.from.startsWith("2024-05")&&q.to.startsWith("2024-06"):q.from.startsWith("2024-06")&&q.to.startsWith("2024-07")));
 const labs=buildLabsList(f.evidence,f.result.records);assert.ok(labs);assert.equal(labsTaskComplete(labs),true);
 const text=serializeLabsList(labs);assert.match(text,/31 g/);assert.match(text,/4.3 kg/);assert.doesNotMatch(text,/98 g|15 kg|6 kg/);
 assert.match(text,/2024-05-02/);assert.match(text,/saved at 2026-01-02T11:00:00Z/);
 const authority=derivePublicationAuthority(f.evidence,labs.records);
 assert.equal(authority.obligations.length,2);assert.ok(authority.obligations.every(o=>o.authority==="certified"&&o.needId));
 assert.deepEqual(authority.obligations.map(o=>o.certifiedRecordIds),[["fern-first"],["reed-last"]]);
});
test("need reordering preserves source-span identity, selected facts and independent certificates",async()=>{
 const a=await fixture(),b=await fixture({input:probes().reverse()});
 const view=f=>selectionPublication(f.ticket,f.result.coverage,transport(f)).certificates.map(c=>[c.sourceSpanId,c.subjectId,c.selectedEventIds]).sort();
 assert.deepEqual(view(a),view(b));
 assert.deepEqual(a.result.records,b.result.records);
});
for(const [name,mutate] of [
 ["missing certificate",c=>c.independentSelections.pop()],
 ["wrong need identity",c=>c.independentSelections[0].needId="unknown"],
 ["wrong source span",c=>c.independentSelections[0].sourceSpanId="another:0:1"],
 ["wrong subject",c=>c.independentSelections[0].coverage.groups[0].petId="reed"],
 ["wrong window",c=>c.independentSelections[0].coverage.windows[0].from="2024-05-03T00:00:00Z"],
 ["wrong typed window",c=>c.independentSelections[0].ticket.temporal.from="2024-05-03T00:00:00Z"],
 ["wrong endpoint role",c=>c.independentSelections[0].coverage.groups[0].clauses[0].direction="desc"],
 ["missing lineage",c=>c.independentSelections[0].coverage.effectiveStream[0].lineageClosed=false],
 ["open replacement seeds",c=>c.independentSelections[0].coverage.effectiveStream[0].replacementSeedsExhausted=false],
 ["wrong record identity",c=>c.independentSelections[0].coverage.groups[0].clauses[0].ids=["reed-last"]],
 ["duplicated certificate",c=>c.independentSelections.push(structuredClone(c.independentSelections[0]))],
]){
 test(name+" cannot certify the complete independent task",async()=>{
  const f=await fixture(),c=structuredClone(f.result.coverage);mutate(c);
  const p=selectionPublication(f.ticket,c,transport(f));assert.equal(p.complete,false);
 });
}
test("omitted represented endpoint cannot be certified by the other subject",async()=>{
 const f=await fixture(),p=selectionPublication(f.ticket,f.result.coverage,transport(f).slice(1));assert.equal(p.complete,false);
});
test("wrong-subject transport cannot borrow an endpoint certificate",async()=>{
 const f=await fixture(),r=transport(f);r[0].petId="reed";
 assert.equal(selectionPublication(f.ticket,f.result.coverage,r).complete,false);
});
test("unrequested or differently scoped evidence need cannot be silently completed",async()=>{
 const f=await fixture();f.evidence.interpretation.request.evidenceNeeds[0].window.from="2024-05-04T00:00:00Z";
 assert.equal(buildLabsList(f.evidence,f.result.records),null);
});
test("legacy advisory probes retain limitation and never mint endpoint certificates",async()=>{
 const input=probes().map(probe=>{const value={...probe};delete value.predicates;delete value.selection;return value;});
 const {ticket}=bind(input);assert.ok(ticket.needs.every(n=>!n.selection));
 assert.equal(selectionPublication(ticket,{status:"complete"},[]),null);
});
test("mixing advisory and explicit selections fails binding instead of dropping an obligation",()=>{
 const input=probes();delete input[1].selection;delete input[1].predicates;
 assert.throws(()=>bind(input),/read_ticket/);
});
test("independent windows cannot inherit an account-wide interval",()=>{
 const {ticket}=bind();const {subjects,needs,...plain}=ticket;
 assert.throws(()=>bindTypedReadTicket({...plain,temporal:{from:"2024-01-01T00:00:00Z",to:null,anchor:null},
 needs:needs.map(({id,petIds,sourceSpanId,...n})=>({...n,needId:id}))},subjects.petIds,needs),/read_ticket/);
});
test("unclosed effective lineage remains a limitation with no false endpoint",async()=>{
 const f=await fixture({graph:{partialPets:["fern"]}});
 const p=selectionPublication(f.ticket,f.result.coverage,transport(f));assert.equal(p.complete,false);
 assert.ok(!p.selectedEventIds.includes("fern-first"));
});
const claim=(id,r,operation="assert",note=r.note)=>({id,user_id:"owner",subject_id:r.pet_profile_id,subject_type:"pet",
 structured_value:{note,title:null,severity:null},occurred_at:r.occurred_at,recorded_at:"2026-02-01T00:00:00Z",
 operation_type:operation,knowledge_status:"effective",persistence_destination:"history",claim_kind:"observation",
 concept_key:"observation",canonical_concept_key:null,concept_resolution_status:"unresolved",provenance_classification:"owner_report"});
test("corrected effective endpoint preserves correction identity and distinct saved time",async()=>{
 const sourceRows=rows(),original=sourceRows.find(r=>r.id==="reed-last");
 const graph={claims:[claim("old",original),claim("amend",original,"correct","mass 4.6 kg")],
 edges:[{id:"edge",user_id:"owner",from_claim_id:"amend",to_claim_id:"old",relation_type:"corrects"}],
 links:[{user_id:"owner",claim_id:"old",legacy_row_id:original.id,legacy_table:"pet_care_entries",claim_role:"primary"}]};
 const f=await fixture({sourceRows,graph}),p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,true);assert.ok(p.selectedEventIds.includes("claim-amend"));assert.ok(!p.selectedEventIds.includes("reed-last"));
 const labs=buildLabsList(f.evidence,f.result.records),text=serializeLabsList(labs);
 assert.match(text,/4.6 kg/);assert.doesNotMatch(text,/4.3 kg/);assert.match(text,/2024-06-25/);assert.match(text,/2026-02-01/);
 assert.ok(f.store.calls.length>0);assert.ok(f.result.coverage.independentSelections.every(p=>p.coverage.effectiveStream.every(s=>s.lineageClosed)));
});
test("a lexical miss is not certified as never-recorded or complete",async()=>{
 const input=probes();input[0].predicates=[{kind:"text_any",terms:["unmatched"]}];
 const f=await fixture({input}),p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,false);assert.equal(p.certificates.find(c=>c.subjectId==="fern").certified,false);
});
test("certificate scopes reject cross-obligation factual claims",async()=>{
 const f=await fixture(),labs=buildLabsList(f.evidence,f.result.records),a=derivePublicationAuthority(f.evidence,labs.records);
 const first=a.obligations[0],second=a.obligations[1];
 assert.notEqual(first.obligationId,second.obligationId);
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:first.obligationId,text:"mass 4.3 kg",sourceIds:second.authorizedSourceIds}]).some(x=>x.startsWith("publication_source_outside_obligation")));
});
test("explicit independent semantics survive typed ticket JSON continuation",()=>{
 const {ticket}=bind(),json=JSON.parse(JSON.stringify(ticket)),{subjects,needs,...plain}=json;
 const rebound=bindTypedReadTicket({...plain,needs:needs.map(({id,petIds,sourceSpanId,...n})=>({...n,needId:id}))},subjects.petIds,needs);
 assert.deepEqual(rebound,ticket);
});
test("policy audit explicitly preserves independent selection authority alongside every old clause",()=>{
 const a=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-policy-audit.json",import.meta.url),"utf8")).independentSelectionReview;
 const sha=s=>createHash("sha256").update(s).digest("hex");
 assert.equal(sha(a.sourceAddition),a.sourceSha256);assert.equal(sha(a.emittedAddition),a.emittedSha256);
 assert.ok(ASK_REQUEST_INSTRUCTIONS.split("\n")[a.sourceSection].includes(a.sourceAddition));
 assert.ok(POLICY_BUNDLE.rules[a.targetRule].includes(a.emittedAddition));assert.equal(a.invariants.length,5);
});

test("correction moving an endpoint across an event window cannot keep the old endpoint",async()=>{
 const sourceRows=rows(),original=sourceRows.find(r=>r.id==="reed-last");
 const amended={...claim("moved",original,"correct","mass 4.8 kg"),occurred_at:"2024-07-04T09:00:00Z"};
 const graph={claims:[claim("old",original),amended],
 edges:[{id:"move",user_id:"owner",from_claim_id:"moved",to_claim_id:"old",relation_type:"corrects"}],
 links:[{user_id:"owner",claim_id:"old",legacy_row_id:original.id,legacy_table:"pet_care_entries",claim_role:"primary"}]};
 const f=await fixture({sourceRows,graph}),p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,true);
 assert.deepEqual(p.certificates.find(c=>c.subjectId==="reed").selectedEventIds,["reed-first"]);
 assert.ok(!p.selectedEventIds.includes("reed-last")&&!p.selectedEventIds.includes("claim-moved"));
});
test("certificate array order does not create positional operand authority",async()=>{
 const f=await fixture(),reversed=structuredClone(f.result.coverage);reversed.independentSelections.reverse();
 assert.deepEqual(selectionPublication(f.ticket,reversed,transport(f)),selectionPublication(f.ticket,f.result.coverage,transport(f)));
});
test("same subject independent windows retain distinct obligation identities",async()=>{
 const input=probes();input[1].petNames=["Juniper"];
 const f=await fixture({input}),p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,true);assert.equal(p.certificates.length,2);
 assert.deepEqual(p.certificates.map(c=>c.selectedEventIds),[["fern-first"],["fern-other"]]);
 assert.notEqual(p.certificates[0].needId,p.certificates[1].needId);
});

test("independent selectors share existing page and publication limits without starving a companion",async()=>{
 const input=probes();input[0].selection.union[0].take.count=100;
 const many=Array.from({length:150},(_,i)=>source("bulk-"+i,"fern",new Date(Date.parse("2024-05-01T00:00:00Z")+i*60000).toISOString(),"meal 21 g"));
 const f=await fixture({input,sourceRows:[...many,...rows().filter(r=>r.pet_profile_id==="reed")]});
 assert.ok(f.store.pages.every(q=>q.limit<=64));assert.ok(f.store.pages.reduce((n,q)=>n+q.limit,0)<=256);
 assert.ok(f.result.records.length<=32);assert.ok(f.result.records.some(r=>r.id==="reed-last"));
 const p=selectionPublication(f.ticket,f.result.coverage,transport(f));
 assert.equal(p.complete,false);assert.equal(p.certificates.find(c=>c.subjectId==="reed").certified,true);
});
