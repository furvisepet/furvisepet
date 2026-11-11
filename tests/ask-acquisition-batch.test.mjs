import test from "node:test";
import assert from "node:assert/strict";
import * as retrieval from "../app/lib/ask-read-only/retrieval.mjs";
import {historyTextFilter,createReadOnlyDataAccess} from "../app/lib/ask-read-only/data.ts";
const request=(pet="fir",terms=[])=>({kind:"history",pet:{id:pet,ownerId:"owner",handle:"p1",name:"Fir"},terms,from:"2025-01-01",to:"2025-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",goal:"relevant_records",offset:0});
const rows=(pet,n)=>Array.from({length:n},(_,i)=>({kind:"history",id:pet+"-"+String(i).padStart(3,"0"),ownerId:"owner",petId:pet,body:(i%4===0?"bright":"ordinary")+" observation",eventAt:new Date(Date.UTC(2025,0,1+i)).toISOString(),recordedAt:new Date(Date.UTC(2025,0,2+i)).toISOString()}));
const fetcher=sets=>async(req,page)=>{
 const selected=(sets[req.pet.id]??[]).filter(row=>(!page.terms.length||page.terms.some(term=>row.body.includes(term)))&&!(page.excludeTerms??[]).some(term=>row.body.includes(term)));
 if(req.order==="desc")selected.reverse();
 return {sources:selected.slice(page.offset,page.offset+page.limit),total:selected.length,hasMore:page.offset+page.limit<selected.length};
};
test("36 overlapping matches cost 36 raw rows and all are examined under unchanged caps",async()=>{
 const req=request("fir",["observation"]),all=rows("fir",36),fetch=fetcher({fir:all});
 const result=await retrieval.discoverHistory({...req,pageBudget:8,candidateBudget:64},page=>fetch(req,page));
 assert.equal(result.inspected,36);assert.equal(result.batchAcquisition.rawRows,36);assert.equal(result.scopeExhausted,true);
 assert.equal(result.total,36);assert.equal(result.discovery.find(l=>l.mode==="complementary").total,0);
});
test("weak nonzero literal hits do not hide complementary candidates",async()=>{
 const [result]=await retrieval.discoverHistoryBatch([request("fir",["bright"])],fetcher({fir:rows("fir",36)}));
 assert.equal(result.sources.length,36);assert.deepEqual(result.discovery.map(l=>l.inspected),[9,27]);assert.equal(result.batchAcquisition.rawRows,36);
});
test("unused capacity reaches a large goal after small goals finish",async()=>{
 const results=await retrieval.discoverHistoryBatch([request("fir"),request("ash"),request("elm"),request("oak")],fetcher({fir:rows("fir",50),ash:rows("ash",1),elm:rows("elm",1),oak:rows("oak",1)}));
 assert.deepEqual(results.map(r=>r.inspected),[50,1,1,1]);assert.ok(results[0].batchAcquisition.attempts<=8);assert.equal(results[0].batchAcquisition.rawRows,53);
});
test("identical goals coalesce and complete lanes are shared across orderings",async()=>{
 const a=request("fir",["observation"]),b={...a,order:"desc"};
 const [x,y,z]=await retrieval.discoverHistoryBatch([a,a,b],fetcher({fir:rows("fir",6)}));
 assert.equal(x.batchAcquisition.coalescedGoals,1);assert.equal(x.batchAcquisition.rawRows,6);assert.equal(x.batchAcquisition.attempts,2);
 assert.equal(y.sources.length,6);assert.deepEqual(z.sources.map(s=>s.id),x.sources.map(s=>s.id).reverse());assert.ok(z.discovery.some(l=>l.reusedPages>0));
});
test("failed attempts count and do not erase an independent goal",async()=>{
 const results=await retrieval.discoverHistoryBatch([request("fir"),request("ash")],async(req,page)=>{
  if(req.pet.id==="fir")throw new Error("ASK_READ_HISTORY_UNAVAILABLE");return fetcher({ash:rows("ash",2)})(req,page);
 });
 assert.equal(results[0].unavailable,true);assert.equal(results[1].sources.length,2);assert.equal(results[1].batchAcquisition.attempts,2);assert.equal(results[1].batchAcquisition.pages,1);
});
test("repeated rows cannot make raw acquisitions exceed 64",async()=>{
 const [r]=await retrieval.discoverHistoryBatch([request("fir")],async(_req,page)=>({sources:Array(page.limit).fill(rows("fir",1)[0]),total:1000,hasMore:true}));
 assert.equal(r.batchAcquisition.rawRows,64);assert.equal(r.inspected,1);assert.equal(r.scopeExhausted,false);assert.ok(r.discovery[0].duplicateRows>0);
});
test("duplicate source groups do not dilute a different pet's source reservation",()=>{
 const a=rows("fir",24),b=rows("ash",24),r=retrieval.allocateEvidence([a,a,b],{records:32,sourceCharacters:24000});
 assert.deepEqual(r.visible.map(v=>v.length),[16,16,16]);assert.equal(r.sources.length,32);
});
test("complement filters retain nulls and quote every literal operand",()=>{
 const f=historyTextFilter([],["a,b).or(note.eq.bad","%_"]);
 assert.ok(f.includes("note.is.null"));assert.ok(f.includes("title.is.null"));
 assert.ok(f.includes('note.not.ilike."%a,b).or(note.eq.bad%"'));assert.ok(f.includes('\\\\%'));assert.ok(f.startsWith("and("));
});
test("active data adapter uses shared scheduler and no look-ahead row",async()=>{
 const ranges=[],filters=[],scope=[],all=rows("fir",36).map(row=>({id:row.id,user_id:"owner",pet_profile_id:"fir",note:row.body,title:null,occurred_at:row.eventAt,created_at:row.recordedAt,deleted_at:null}));
 const db={from(){let start=0,end=15,filter=null;const builder={
  select(){return this;},eq(k,v){scope.push([k,v]);return this;},is(){return this;},gte(){return this;},lt(){return this;},in(){return this;},retry(){return this;},abortSignal(){return this;},order(){return this;},
  or(f){filter=f;filters.push(f);return this;},range(a,b){start=a;end=b;ranges.push([a,b]);return this;},
  async maybeSingle(){return {data:{id:"fir",user_id:"owner"},error:null};},
  then(resolve,reject){return Promise.resolve({data:(filter?.startsWith("and(")?[]:all).slice(start,end+1),count:filter?.startsWith("and(")?0:36,error:null}).then(resolve,reject);}
 };return builder;}};
 const read=createReadOnlyDataAccess(db,"owner","UTC");
 const [r]=await read.batch([request("fir",["observation"])]);
 assert.equal(r.inspected,36);assert.ok(ranges.every(([a,b])=>b-a+1<=16));assert.ok(filters.some(f=>f.startsWith("and(")));
 assert.ok(scope.some(([k,v])=>k==="user_id"&&v==="owner"));
});


test("omitted date hints survive persistence without remembering omitted text",async()=>{
 const {runReadOnlyAsk}=await import("../app/lib/ask-read-only/core.mjs");
 const {restoreReadReferences,describeReadReferences}=await import("../app/lib/ask-read-only/references.mjs");
 const req=request("fir"),all=rows("fir",36),read=async()=>{throw Error("batch required");};
 read.batch=requests=>retrieval.discoverHistoryBatch(requests,fetcher({fir:all}));
 const input={ownerId:"owner",selectedPetId:"fir",pets:[{id:"fir",ownerId:"owner",name:"Fir",species:"cat"}],question:"Read the scoped collection.",dialogue:[],now:"2025-12-31T00:00:00Z",timeZone:"UTC"};
 let finalScope;
 const result=await runReadOnlyAsk(input,{read,provider:async(packet,phase)=>{
  if(phase==="read_selection")return {calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:req.from,to:req.to,query:null,offset:0,order:"asc",goal:"complete_set",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event"})}],text:""};
  finalScope=packet.TOOL_DATA[0];
  return {components:[{kind:"saved",text:"A bounded collection was returned.",sources:finalScope.sources.map(s=>s.source)}],sources:[],quotes:[],calculations:[],replyType:"partial"};
 }});
 assert.equal(finalScope.inspected,36);assert.equal(finalScope.sources.length,32);assert.equal(finalScope.omitted,4);
 assert.deepEqual(finalScope.omittedEventRange,{from:"2025-02-02",to:"2025-02-05"});
 const refs=restoreReadReferences(JSON.parse(JSON.stringify(result.readReferences)),[{id:"fir",ownerId:"owner",handle:"p1",name:"Fir"}]);
 assert.deepEqual(describeReadReferences(refs)[0].omittedEventRange,finalScope.omittedEventRange);
 assert.ok(!JSON.stringify(result.readReferences).includes("observation"));
});

test("coalesced SQL scopes still retain each goal's evidence ordering",async()=>{
 const req={...request("fir",["bright"]),goal:"complete_set"},all=rows("fir",36);
 const [a,b]=await retrieval.discoverHistoryBatch([{...req,goal:"relevant_records"},req],fetcher({fir:all}));
 assert.equal(a.batchAcquisition.coalescedGoals,1);assert.equal(b.discovery.reduce((n,l)=>n+l.attempts,0),0);
 assert.deepEqual(b.sources.map(s=>s.id),all.map(s=>s.id));
});
