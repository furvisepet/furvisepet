import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createReadOnlyDataAccess, literalSearch } from "../app/lib/ask-read-only/data.ts";
import { createHash } from "node:crypto";
const pet={id:"pet-a",ownerId:"owner-a",handle:"p1",name:"Willow",species:"dog"};
const request={kind:"history",pet,goal:"relevant_records",from:"2025-01-01",to:"2025-01-31",recordedFrom:"2025-03-01",recordedTo:"2025-03-31",orderBy:"recorded",order:"asc",offset:0,pageBudget:2,terms:["meal,or(user_id.eq.other)","appetite"]};
const fixture={id:"note-a",user_id:"owner-a",pet_profile_id:"pet-a",note:"An original observation.",title:"Meal observation",occurred_at:"2025-01-12T12:00:00Z",created_at:"2025-03-12T12:00:00Z",deleted_at:null};
function setup({foreign=false,failHistory=false}={}){
 const seen=[];
 const db=createClient("https://example.supabase.co","fixture-public-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  const u=new URL(url);seen.push({url:u,method:init?.method??"GET"});
  const profile=u.pathname.endsWith("dog_profiles");
  if(!profile&&failHistory)return new Response(JSON.stringify({message:"fixture unavailable"}),{status:503,headers:{"content-type":"application/json"}});
  const data=profile?{id:pet.id,user_id:pet.ownerId}:[{...fixture,...(foreign?{user_id:"other"}:{})}];
  return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json","content-range":"0-0/1"}});
 }}});
 return {seen,read:createReadOnlyDataAccess(db,"owner-a","America/Los_Angeles",{from:"1900-01-01T00:00:00Z",to:"2026-11-11T00:00:00Z"})};
}
test("real SDK query builder preserves ownership and both calendar scopes on all discovery lanes",async()=>{
 const {read,seen}=setup();const result=await read(request);
 assert.equal(result.sources[0].body,fixture.note);assert.equal(result.sources.length,1);assert.equal(result.discovery.length,2);
 const history=seen.filter(item=>item.url.pathname.endsWith("pet_care_entries"));assert.equal(history.length,2);
 for(const {url,method} of history){
  const p=url.searchParams;assert.equal(method,"GET");assert.equal(p.get("user_id"),"eq.owner-a");assert.equal(p.get("pet_profile_id"),"eq.pet-a");assert.equal(p.get("deleted_at"),"is.null");
  assert.ok(p.getAll("occurred_at").includes("gte.2025-01-01T08:00:00.000Z"));assert.ok(p.getAll("occurred_at").includes("lt.2025-02-01T08:00:00.000Z"));
  assert.deepEqual(p.getAll("created_at"),["gte.2025-03-01T08:00:00.000Z","lt.2025-04-01T07:00:00.000Z"]);
  assert.equal(p.get("order"),"created_at.asc,id.asc");assert.equal(p.get("limit"),"16");
 }
 assert.ok(history[0].url.searchParams.get("or").includes('note.ilike.'+JSON.stringify(literalSearch(request.terms[0]))));
 assert.ok(history[0].url.searchParams.get("or").includes('title.ilike."%appetite%"'));
 const complement=history[1].url.searchParams.get("or");
 for(const column of ["note","title"])for(const term of request.terms){assert.ok(complement.includes(column+".is.null"));assert.ok(complement.includes(column+".not.ilike."+JSON.stringify(literalSearch(term))));}
});
test("SDK response ownership violations still fail closed",async()=>{
 const {read}=setup({foreign:true});await assert.rejects(()=>read(request),/NOT_AUTHORIZED/);
});
test("history outage reports a partial goal without inventing empty-history success",async()=>{
 const {read}=setup({failHistory:true});const result=await read(request);
 assert.equal(result.unavailable,true);assert.equal(result.scopeExhausted,false);assert.equal(result.sources.length,0);
});
test("expired retrieval deadline dispatches no history query",async()=>{
 const {read,seen}=setup();const result=await read({...request,deadlineAt:Date.now()-1});
 assert.equal(seen.length,1);assert.equal(result.unavailable,true);
});
test("exact-source reference filter stays owner-bound and validates its fingerprint",async()=>{
 const {read,seen}=setup();
 const result=await read({...request,terms:[],referenceTimeZone:"UTC",sourceIds:[fixture.id],expectedSources:[{id:fixture.id,hash:createHash("sha256").update(fixture.note).digest("hex"),eventAt:fixture.occurred_at,recordedAt:fixture.created_at}]});
 assert.equal(result.staleReference,false);assert.equal(result.sources.length,1);
 const history=seen.find(item=>item.url.pathname.endsWith("pet_care_entries"));
 assert.equal(history.url.searchParams.get("id"),"in.(note-a)");assert.equal(history.url.searchParams.get("user_id"),"eq.owner-a");
 assert.ok(history.url.searchParams.getAll("occurred_at").includes("gte.2025-01-01T00:00:00.000Z"));
});
