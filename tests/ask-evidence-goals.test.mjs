import test from "node:test";
import assert from "node:assert/strict";
import { discoverHistory, discoverHistoryBatch, allocateEvidence } from "../app/lib/ask-read-only/retrieval.mjs";
import { bindReadTool, runReadOnlyAsk, validateReadOnlyAnswer, READ_ONLY_LIMITS, readOnlyToolsForPets } from "../app/lib/ask-read-only/core.mjs";
import { readCoverageMessages } from "../app/lib/ask-read-only/coverage.mjs";
import { calculateReadSources, readSourceMeasurements } from "../app/lib/ask-read-only/calculations.mjs";
const pets=[{id:"pet-a",ownerId:"owner",handle:"p1",name:"Willow",species:"dog"},{id:"pet-b",ownerId:"owner",handle:"p2",name:"Birch",species:"cat"}];
const row=(id,petId="pet-a",body="An observation.")=>({kind:"history",id,petId,ownerId:"owner",body,eventAt:"2025-04-02T12:00:00Z",recordedAt:"2025-06-04T12:00:00Z"});
const args=(extra={})=>({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc",goal:"relevant_records",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event",...extra});
const input={ownerId:"owner",selectedPetId:"pet-a",pets,question:"Compare the observations and explain the general idea.",dialogue:[],now:"2026-11-10T12:00:00Z",timeZone:"UTC"};
const output=(components)=>({components,quotes:[],sources:[],calculations:[],replyType:"answer"});
const general={kind:"general",text:"A general explanation survives.",sources:[]};
function execute(read,requests=[args()],answer=output([general])) {
 const calls=[];
 return {calls,run:()=>runReadOnlyAsk(input,{read,provider:async(request,phase)=>{
  calls.push({request,phase});return calls.length===1?{text:"draft",calls:requests.map((value,index)=>({id:"call-"+index,name:"search_saved_records",arguments:JSON.stringify(value)}))}:answer;
 }})};
}
test("native tool schema requires evidence goal and both temporal axes",()=>{
 const schema=readOnlyToolsForPets(pets).find(tool=>tool.name==="search_saved_records").parameters;
 for(const field of ["goal","alternatives","recordedFrom","recordedTo","orderBy"])assert.ok(schema.required.includes(field));
 assert.deepEqual(schema.properties.pet.enum,["p1","p2"]);
});
test("binding preserves independent event/recorded bounds and alternative semantics",()=>{
 const request=bindReadTool("search_saved_records",args({from:"2025-01-01",to:"2025-01-31",recordedFrom:"2025-03-01",recordedTo:"2025-03-31",orderBy:"recorded",query:"appetite",alternatives:["meal","appetite"]}),pets);
 assert.equal(request.from,"2025-01-01");assert.equal(request.recordedFrom,"2025-03-01");assert.equal(request.orderBy,"recorded");assert.deepEqual(request.terms,["appetite","meal"]);
});
test("malformed scopes and unknown authority reject before reads",()=>{
 for(const extra of [{pet:"pet-a"},{recordedFrom:"2025-02-30"},{recordedFrom:"2025-04-01",recordedTo:"2025-03-01"},{goal:"all_truth"},{orderBy:"other"},{alternatives:["a","b","c"]},{alternatives:["\u0000"]},{ownerId:"other"}])assert.throws(()=>bindReadTool("search_saved_records",args(extra),pets));
});
test("nonzero lexical hits do not suppress complementary discovery",async()=>{
 const seen=[];
 const result=await discoverHistory({terms:["literal","alternative"],pageBudget:2},async request=>{
  seen.push(request);return {sources:[row(request.terms.length?"weak":"relevant")],total:1,hasMore:false};
 });
 assert.equal(seen.length,2);assert.deepEqual(seen[0].terms,["alternative","literal"]);assert.deepEqual(seen[1].terms,[]);
 assert.deepEqual(result.sources.map(source=>source.id),["weak","relevant"]);assert.equal(result.matchedTotal,1);assert.equal(result.semanticRecallVerified,false);
});
test("lexical and broader candidates interleave before allocation",async()=>{
 const result=await discoverHistory({terms:["hint"],pageBudget:2},async request=>({sources:Array.from({length:16},(_,i)=>row((request.terms.length?"literal":"broad")+i)),total:100,hasMore:true}));
 assert.deepEqual(result.sources.slice(0,4).map(source=>source.id),["literal0","broad0","literal1","broad1"]);
 assert.equal(result.scopeExhausted,false);assert.equal(result.inspected,32);
});
test("complete-set acquisition spans pages and stops at exact exhaustion",async()=>{
 const seen=[];const result=await discoverHistory({terms:[],goal:"complete_set",pageBudget:8},async request=>{
  seen.push(request.offset);return {sources:Array.from({length:request.offset===0?16:3},(_,i)=>row(String(request.offset+i))),total:19,hasMore:request.offset===0};
 });
 assert.deepEqual(seen,[0,16]);assert.equal(result.sources.length,19);assert.equal(result.scopeExhausted,true);
});
test("query/row budget and prior-offset disclosure are bounded",async()=>{
 let pages=0;const result=await discoverHistory({terms:[],pageBudget:100,offset:16},async()=>{pages++;return {sources:Array.from({length:16},(_,i)=>row(pages+":"+i)),hasMore:true,total:1000};});
 assert.equal(pages,4);assert.equal(result.sources.length,64);assert.equal(result.scopeExhausted,false);
});
test("a failed page preserves acquired evidence and reports unavailable",async()=>{
 let pages=0;const result=await discoverHistory({terms:[],pageBudget:2},async()=>{if(++pages===2)throw Error("ASK_READ_HISTORY_UNAVAILABLE");return {sources:[row("found")],hasMore:true,total:20};});
 assert.equal(result.sources.length,1);assert.equal(result.unavailable,true);assert.equal(result.scopeExhausted,false);
});
test("ownership and source consistency failures are not converted into partial success",async()=>{
 await assert.rejects(()=>discoverHistory({terms:[],pageBudget:2},async()=>{throw Error("ASK_READ_SOURCE_NOT_AUTHORIZED");}),/NOT_AUTHORIZED/);
 let pages=0;await assert.rejects(()=>discoverHistory({terms:["hint"],pageBudget:2},async()=>({sources:[row("same","pet-a",++pages===1?"first":"changed")],hasMore:false})),/SOURCE_CHANGED/);
});
test("four goals receive reserved slots instead of first-read dominance",()=>{
 const groups=Array.from({length:4},(_,g)=>Array.from({length:32},(_,i)=>row(g+":"+i,"pet-"+g,"x".repeat(100))));
 const result=allocateEvidence(groups,READ_ONLY_LIMITS);
 assert.equal(result.sources.length,32);assert.deepEqual(result.visible.map(rows=>rows.length),[8,8,8,8]);
});
test("candidate reservations retain both discovery lanes inside the raw-row budget",async()=>{
 const seen=[];const result=await discoverHistory({terms:["hint"],pageBudget:2,candidateBudget:16},async request=>{
  seen.push(request);return {sources:Array.from({length:request.limit},(_,i)=>row((request.terms.length?"literal":"broad")+i)),total:100,hasMore:true};
 });
 assert.deepEqual(seen.map(request=>request.limit),[8,8]);assert.equal(result.sources.length,16);assert.equal(result.scopeExhausted,false);
});
test("character reservations preserve diverse sources before redistribution",()=>{
 const result=allocateEvidence([[row("large","pet-a","x".repeat(12000))],[row("b","pet-b","b".repeat(5000))],[row("c","pet-c","c".repeat(5000))],[row("d","pet-d","d".repeat(5000))]],READ_ONLY_LIMITS);
 assert.deepEqual(result.visible.map(rows=>rows.length),[0,1,1,1]);assert.deepEqual(result.omitted,[1,0,0,0]);
});
test("unused reservations redistribute while quote strings remain whole",()=>{
 const body="x".repeat(12000);const result=allocateEvidence([[row("big","pet-a",body)],[row("small","pet-b")]],READ_ONLY_LIMITS);
 assert.equal(result.sources.length,2);assert.equal(result.sources.find(source=>source.id==="big").body,body);
 const large=allocateEvidence([[row("oversized","pet-a","x".repeat(12001))]],READ_ONLY_LIMITS);assert.equal(large.sources.length,0);assert.deepEqual(large.omitted,[1]);
});
test("core keeps two calls, fair page budgets, and both pet scopes",async()=>{
 const requests=[];const runner=execute(async request=>{requests.push(request);return {sources:[row(request.pet.id,request.pet.id)],hasMore:false,total:1};},[args({goal:"comparison"}),args({pet:"p2",goal:"comparison"})]);
 const result=await runner.run();assert.equal(result.providerCallCount,2);assert.deepEqual(requests.map(request=>request.pageBudget),[4,4]);
 assert.deepEqual(result.coverage.map(item=>item.scope.pet),["Willow","Birch"]);assert.equal(result.coverage[0].semanticRecallVerified,false);
});
test("general component survives unsupported saved component",async()=>{
 const runner=execute(async()=>({sources:[],total:0,hasMore:false}),[args()],output([general,{kind:"saved",text:"Unsupported private assertion.",sources:[]}]));
 const result=await runner.run();assert.match(result.answer.answer,/general explanation survives/);assert.doesNotMatch(result.answer.answer,/Unsupported private/);assert.equal(result.answer.replyType,"partial");assert.equal(result.answer.limited,true);
});
test("one unavailable goal does not erase another supported answer",async()=>{
 const runner=execute(async request=>request.pet.id==="pet-a"?{sources:[row("found")],hasMore:false,total:1}:{sources:[],unavailable:true,hasMore:true,scopeExhausted:false,discovery:[]},[args(),args({pet:"p2"})],output([{kind:"saved",text:"This saved observation is supported.",sources:["s1"]},general]));
 const result=await runner.run();assert.equal(result.sources.length,1);assert.match(result.answer.answer,/supported/);assert.equal(result.coverage[1].status,"partial");assert.ok(result.coverage[1].unmet.includes("retrieval_unavailable"));
});
test("component source references fail closed and exact quotations remain server-owned",()=>{
 const sources=[{...row("one"),handle:"s1"}];
 assert.throws(()=>validateReadOnlyAnswer(output([{kind:"saved",text:"wrong",sources:["unknown"]}]),sources));
 const value=validateReadOnlyAnswer({...output([{kind:"saved",text:"Supported.",sources:["s1"]}]),quotes:["s1"]},sources);
 assert.equal(value.quotes[0].quote,sources[0].body);assert.deepEqual(value.sources,["s1"]);
});
test("no-read conversation retains zero private reads and two-call review",async()=>{
 const runner=execute(async()=>{throw Error("must not read");},[]);const result=await runner.run();assert.equal(result.providerCallCount,2);assert.match(result.answer.answer,/general explanation/);
});
test("coverage distinguishes both time axes, discovery and evidence omissions",()=>{
 const [message]=readCoverageMessages([{scope:{pet:"Willow",goal:"complete_set",from:"2025-01-01",to:"2025-01-31",recordedFrom:"2025-03-01",recordedTo:"2025-03-31"},discovery:[{mode:"lexical",inspected:16,total:80,pages:1,exhausted:false},{mode:"broader",inspected:16,total:100,pages:1,exhausted:false}],returned:8,inspected:30,omitted:22,truncated:true,unmet:["evidence_omitted"]}]);
 assert.match(message,/event dates 2025-01/);assert.match(message,/recorded dates 2025-03/);assert.match(message,/22 examined notes omitted/);assert.match(message,/does not establish semantic completeness or prove every related/);assert.match(message,/partial/);
});
test("measurement handles retain nearby meaning without inventing a historical metric",()=>{
 const values=readSourceMeasurements("Meal portion 120 g.\nBody weight 4 kg.","s1");
 assert.equal(values[0].metric,null);assert.match(values[0].context,/Meal portion/);assert.match(values[1].context,/Body weight/);
 assert.doesNotMatch(values[1].context,/Meal portion/);
});
test("duplicate operands and cross-pet temporal changes cannot silently yield numbers",()=>{
 const sources=[{...row("a"),handle:"s1",body:"Weight 4 kg."},{...row("b","pet-b"),handle:"s2",body:"Weight 6 kg.",eventAt:"2025-05-01T12:00:00Z"}];
 for(const calculation of [{operation:"sum",operands:["s1:m1","s1:m1"]},{operation:"difference",operands:["s1:m1","s2:m1"]}])assert.equal(calculateReadSources([calculation],sources)[0].available,false);
 assert.equal(calculateReadSources([{operation:"absolute_difference",operands:["s1:m1","s2:m1"]}],sources)[0].value,2);
});
test("aggregates disclose selected operands and partial evidence in server text",async()=>{
 const runner=execute(async()=>({sources:[row("a","pet-a","Weight 4 kg."),{...row("b","pet-a","Weight 6 kg."),eventAt:"2025-05-01T12:00:00Z"}],hasMore:true,total:40}),[args({goal:"complete_set"})],{...output([{kind:"saved",text:"The selected measurements can be combined.",sources:["s1","s2"]}]),calculations:[{operation:"sum",operands:["s1:m1","s2:m1"]}]});
 const result=await runner.run();assert.equal(result.answer.calculations[0].value,10);assert.match(result.answer.calculations[0].text,/selected measurements only; evidence coverage is partial/);
});

// Exercise the shared allocator too: reserving rows repeatedly across every
// active lane must not strand rows when the eight-page limit is reached.
test("four independent scopes reserve all discovery lanes without stranding raw rows",async()=>{
 const requests=Array.from({length:4},(_,i)=>({pet:{ownerId:"owner",id:"pet-"+i},terms:["hint"],goal:"relevant_records"}));
 const seen=[];
 const results=await discoverHistoryBatch(requests,async(request,page)=>{
  seen.push({pet:request.pet.id,...page});
  return {sources:Array.from({length:page.limit},(_,i)=>row(request.pet.id+":"+(page.terms.length?"literal":"complementary")+i,request.pet.id)),total:100,hasMore:true};
 },{pages:8,rows:64});
 assert.equal(seen.length,8);assert.deepEqual(seen.map(page=>page.limit),Array(8).fill(8));
 for(const result of results){
  assert.deepEqual(result.discovery.map(lane=>lane.rawRows),[8,8]);
  assert.equal(result.sources.length,16);assert.equal(result.scopeExhausted,false);
  assert.equal(result.batchAcquisition.rawRows,64);assert.equal(result.batchAcquisition.attempts,8);
 }
});
