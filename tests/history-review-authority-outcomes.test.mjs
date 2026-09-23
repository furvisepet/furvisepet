import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c);}});
const {bindCompositionalReadTicket}=await import("../app/lib/furvise-brain/read-selection.ts");
const {retrieveReadTicket}=await import("../app/lib/furvise-brain/lungs.ts");
const {evidenceSource}=await import("../app/lib/intelligence/ask-evidence.ts");
const {derivePublicationAuthority,publicationClaimFailures}=await import("../app/lib/intelligence/publication-authority.ts");
const {historyPublicationLimitation}=await import("../app/lib/intelligence/ordinary-history-publication.ts");
const {recordHistoryReview,readReviewedHistoryAnswer,historyReviewSignature}=await import("../app/lib/intelligence/history-review-state.ts");
async function fixture({missing=false,mixed=false,empty=false}={}){
  const petIds=mixed?["subject-a","subject-b"]:["subject-a"];
  const ticket=bindCompositionalReadTicket({operation:"read",subjectScope:"named",needs:[],episode:null,
    temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[],
    outputs:{completeness:"sufficient",ordering:"asc",limit:null},
    selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"asc"}],take:{count:1,per:"group"}}]}},petIds);
  const rows=empty?[]:petIds.map((petId,i)=>({id:"record-"+i,user_id:"owner",pet_profile_id:petId,
    category:"general",title:null,note:"An observation was recorded.",deleted_at:null,
    occurred_at:"2020-01-01T12:00:00Z",created_at:"2020-01-01T12:00:00Z"}));
  const result=await retrieveReadTicket(ticket,{userId:"owner",ownedPetIds:petIds,
    from:"2010-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-09-22T00:00:00Z"},{
    page:async({petId,offset,limit})=>rows.filter(r=>r.pet_profile_id===petId).slice(offset,offset+limit),
    effective:async rows=>({records:rows,reliable:true}),
    effectiveWindow:async({petId,rows})=>({records:rows,lineageClosed:petId!=="subject-b",
      replacementSeedsExhausted:petId!=="subject-b",sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
  const evidence={version:"ask-evidence.v1",timeZone:"UTC",petNames:{},
    scope:{authorizedPetIds:petIds,requestText:"fixture source text",status:"resolved",readOnlyRecall:true},
    interpretation:{operation:"recall",readOperation:"recall",request:{mode:"read",evidenceBasis:"saved_history",quantity:"records",readTicket:ticket}},
    history:{...(missing?{}:{ticketCoverage:result.coverage}),provenance:[],reasons:[],needs:[]},
    sources:petIds.map(p=>evidenceSource(p,"care_entries",rows.filter(r=>r.pet_profile_id===p).map(r=>"care:"+r.id))),
    represented:rows.map(r=>({sourceId:"care:"+r.id,petId:r.pet_profile_id,sourceType:"care_update",
      text:r.note,start:0,end:r.note.length,occurredAt:r.occurred_at})),losses:[]};
  return {evidenceContract:evidence,applicationActions:[],answer:{title:"Furvise",
    summary:historyPublicationLimitation(evidence),sections:[],safetyNote:null},historyNarrativeDeclined:true,relevantContextIds:[]};
}
function receipt(result,authorityClaims=[],sourceIds=[]){
  recordHistoryReview(result,{signature:historyReviewSignature(result),text:result.answer.summary,authorityClaims,sourceIds});
  return readReviewedHistoryAnswer(result);
}
const claim=o=>({obligationId:o.obligationId,text:"An observation was recorded.",sourceIds:[...o.authorizedSourceIds]});
test("all-unavailable source-free receipt is valid without factual claims",async()=>{
  const r=await fixture({missing:true}),a=derivePublicationAuthority(r.evidenceContract);
  assert.ok(a.obligations.every(o=>o.authority==="unavailable"));
  assert.deepEqual(a.authorizedSourceIds,[]);assert.ok(receipt(r));
});
test("unavailable obligation rejects a fabricated claim including an absence claim",async()=>{
  const r=await fixture({missing:true}),o=derivePublicationAuthority(r.evidenceContract).obligations[0];
  for(const text of ["An observation was recorded.","There are no matching records."]){
    const c={obligationId:o.obligationId,text,sourceIds:[]};
    assert.ok(publicationClaimFailures(r.evidenceContract,[c]).length);
    assert.equal(receipt(r,[c]),null);
  }
});
test("all-unavailable receipt rejects factual source IDs without claims",async()=>{
  const r=await fixture({missing:true});
  assert.equal(receipt(r,[],["care:record-0"]),null);
});
test("mixed receipt requires only the certified claim and rejects unavailable claims and sources",async()=>{
  const r=await fixture({mixed:true}),a=derivePublicationAuthority(r.evidenceContract);
  const yes=a.obligations.find(o=>o.authority==="certified"),no=a.obligations.find(o=>o.authority==="unavailable");
  assert.ok(yes);assert.ok(no);assert.deepEqual(no.authorizedSourceIds,[]);
  assert.equal(receipt(r),null);
  assert.ok(receipt(r,[claim(yes)],yes.authorizedSourceIds));
  assert.equal(receipt(r,[claim(yes),claim(no)],yes.authorizedSourceIds),null);
  assert.equal(receipt(r,[claim(yes)],[...yes.authorizedSourceIds,"care:record-1"]),null);
});
test("certified factual receipt retains claim, source, value/date and snapshot checks",async()=>{
  const r=await fixture(),o=derivePublicationAuthority(r.evidenceContract).obligations[0];
  assert.equal(o.authority,"certified");assert.equal(receipt(r),null);
  assert.ok(receipt(r,[claim(o)],o.authorizedSourceIds));
  assert.equal(receipt(r,[{...claim(o),sourceIds:["care:another"]}],["care:another"]),null);
  assert.equal(receipt(r,[{...claim(o),text:"An observation was recorded on 1990-02-03."}],o.authorizedSourceIds),null);
  assert.ok(receipt(r,[claim(o)],o.authorizedSourceIds));
  r.evidenceContract.represented[0].text="changed";
  assert.equal(readReviewedHistoryAnswer(r),null);
});
test("certified complete-empty authority still requires a claim despite zero source IDs",async()=>{
  const r=await fixture({empty:true}),o=derivePublicationAuthority(r.evidenceContract).obligations[0];
  assert.equal(o.authority,"certified");assert.equal(o.status,"complete_empty");assert.deepEqual(o.authorizedSourceIds,[]);
  assert.equal(receipt(r),null);
  assert.ok(receipt(r,[{obligationId:o.obligationId,text:"No matching records in the certified window.",sourceIds:[]}]));
});
