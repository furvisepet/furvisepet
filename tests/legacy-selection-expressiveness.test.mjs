import assert from "node:assert/strict";
import test from "node:test";
import { bindReadTicket } from "../app/lib/furvise-brain/read-ticket.ts";
import { bindCompositionalReadTicket,eventOrder } from "../app/lib/furvise-brain/read-selection.ts";
import { retrieveReadTicket } from "../app/lib/furvise-brain/lungs.ts";
import { translateLegacyReadSelection } from "../app/lib/intelligence/legacy-read-selection.ts";
const scope={userId:"owner",ownedPetIds:["a","b"],from:"2010-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z",asOf:"2026-09-20T00:00:00Z"};
const row=(pet,i,note="observation")=>({id:pet+i,user_id:"owner",pet_profile_id:pet,occurred_at:new Date(Date.UTC(2020,0,i)).toISOString(),created_at:new Date(Date.UTC(2020,0,i)).toISOString(),deleted_at:null,title:null,note});
const proposal=(strategy="chronological",limit=null,extra={})=>({operation:strategy==="temporal_endpoints"?"compare":"read",temporal:{from:null,to:null,anchor:null},predicates:[],outputs:{completeness:"exhaustive",ordering:"desc",limit,strategy},...extra});
const clause=direction=>({orderBy:[{field:"event_at",direction}],take:{count:1,per:"group"}});
const native=(p,pets,union=[clause("asc"),clause("desc")])=>{const{strategy,...outputs}=p.outputs;return bindCompositionalReadTicket({...p,outputs,selection:{groupBy:["subject"],union}},pets);};
const store=rows=>({page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at).sort((a,b)=>q.ordering==="desc"?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit),effective:async r=>({records:r,reliable:true})});
const run=(ticket,rows)=>retrieveReadTicket(ticket,scope,store(rows));
test("unbounded all-matching records use a generic set proof instead of chronology receipts",async()=>{
 const p=proposal(),legacy=bindReadTicket(p,["a"]),plain=bindReadTicket({...p,outputs:{...p.outputs,strategy:null}},["a"]);
 const a=await run(legacy,[row("a",1),row("a",2)]),b=await run(plain,[row("a",1),row("a",2)]);
 assert.deepEqual(a.records,b.records);assert.equal(a.coverage.status,b.coverage.status);
 assert.ok(a.coverage.chronology);assert.equal(b.coverage.chronology,undefined);assert.equal(b.coverage.resultSet.certified,true);
});
test("generic unbounded transport preserves oversized skip behavior with explicit loss",async()=>{
 const p=proposal(),rows=[row("a",1),row("a",2,"x".repeat(19001))];
 const a=await run(bindReadTicket(p,["a"]),rows),b=await run(bindReadTicket({...p,outputs:{...p.outputs,strategy:null}},["a"]),rows);
 assert.deepEqual(a.records.map(r=>r.id),["a1"]);assert.deepEqual(b.records.map(r=>r.id),["a1"]);assert.deepEqual(b.coverage.resultSet.omittedIds,["a2"]);
 assert.equal(a.coverage.status,"partial");assert.equal(b.coverage.status,"partial");
});
test("global limit is not per-group cardinality or round-robin transport",async()=>{
 const p=proposal("chronological",1),rows=[row("a",1),row("b",3)];
 for(const pets of [["a","b"],["b","a"]]){
 const old=await run(bindReadTicket(p,pets),rows),perGroup=await run(native(p,pets,[clause("desc")]),rows);
 assert.deepEqual(old.records.map(r=>r.id),["b3"]);assert.deepEqual(perGroup.records.map(r=>r.id),["a1"]);
 assert.ok(perGroup.coverage.groups.some(g=>g.blocked));
 }
});
test("endpoint reservation precedes global order; union plus result-time take is not equivalent",async()=>{
 const p=proposal("temporal_endpoints",2),rows=[1,2,3,4].map(i=>row("a",i));
 const old=await run(bindReadTicket(p,["a"]),rows);
 assert.deepEqual(old.records.map(r=>r.id),["a4","a1"]);
 const flat=[...rows].sort((a,b)=>eventOrder(b,a)).slice(0,2);
 assert.deepEqual(flat.map(r=>r.id),["a4","a3"]);
});
test("legacy reservation is priority, not a guarantee that all required rows fit",async()=>{
 const p=proposal("temporal_endpoints",1),rows=[row("a",1),row("a",3)];
 const r=await run(bindReadTicket(p,["a"]),rows);
 assert.deepEqual(r.records.map(r=>r.id),["a3"]);assert.equal(r.coverage.endpointPairs[0].blocked,true);
 assert.deepEqual(r.coverage.endpointPairs[0].earliestIds,["a1"]);
});
test("missing subjects free old capacity for interiors; native union does not fill",async()=>{
 const p=proposal("temporal_endpoints",4),rows=[1,2,3,4,5].map(i=>row("a",i));
 for(const pets of [["a","b"],["b","a"]]){
 const a=await run(bindReadTicket(p,pets),rows),b=await run(native(p,pets),rows);
 assert.deepEqual(a.records.map(r=>r.id),["a5","a4","a3","a1"]);
 assert.deepEqual(b.records.map(r=>r.id),["a5","a1"]);
 assert.equal(a.coverage.endpointPairs.find(x=>x.petId==="b").blocked,true);
 }
});
test("hints reserve optional context after factual truncation",async()=>{
 const p=proposal("chronological",1,{searchHints:["food"]}),rows=[row("a",1,"food"),row("a",3,"unrelated")];
 const ranked=await run(bindReadTicket(p,["a"]),rows);
 assert.deepEqual(ranked.records.map(r=>r.id),["a3"]);
 assert.deepEqual(ranked.supportingContext.records.map(r=>r.id),["a1"]);
 const all=await run(bindReadTicket({...p,outputs:{...p.outputs,limit:null}},["a"]),rows);
 assert.equal(all.records.length,2);assert.equal(all.coverage.status,"complete");
 assert.ok(!all.coverage.reasons.includes("bounded_period_context_not_semantic_completeness"));
});
test("subject grouping rejects result-level take; result scope must be explicit",()=>{
 const p=proposal();delete p.outputs.strategy;
 assert.throws(()=>bindCompositionalReadTicket({...p,selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"desc"}],take:{count:5,per:"result"}}]}},["a","b"]),
 e=>e.cause?.rule==="group_count_1_to_100");
});
test("calendar selectors cannot be passed as unresolved compositional windows",()=>{
 const p=proposal();delete p.outputs.strategy;p.temporal.calendar="oldest_year";
 assert.throws(()=>native(p,["a"]),e=>e.cause?.rule==="unresolved_window");
});
test("independent legacy evidence obligations are preserved, not flattened",()=>{
 const ticket=bindReadTicket(proposal("chronological",1),["a"]);
 assert.equal(translateLegacyReadSelection(ticket,{evidenceNeedCount:1}).ticket,ticket);
});
