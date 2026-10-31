import test from "node:test";
import assert from "node:assert/strict";
import {fixture,withBrowserTransport,entry} from "./helpers/history-note-edit-contract.mjs";
import {idempotentClientFetch} from "../app/lib/security/idempotency/client.ts";

const storage=()=>{const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
for(const [name,error,status,code] of [
 ["legacy stale",{code:"40001",message:"CARE_ENTRY_STALE"},409,"CARE_ENTRY_STALE"],
 ["PT409 stale",{code:"PT409",message:"CARE_ENTRY_STALE"},409,"CARE_ENTRY_STALE"],
 ["real serialization",{code:"40001",message:"could not serialize access due to concurrent update"},503,undefined],
 ["missing discriminator",{code:"40001"},503,undefined],
 ["foreign conflict",{code:"40001",message:"SUGGESTION_CONFLICT"},503,undefined],
 ["unrelated PT409",{code:"PT409",message:"OTHER_CONFLICT"},503,undefined],
 ["unavailable",{code:"PGRST003",message:"Unavailable"},503,undefined],
 ["permission with stale text",{code:"42501",message:"CARE_ENTRY_STALE"},503,undefined],
 ["wrong code with stale text",{code:"P0001",message:"CARE_ENTRY_STALE"},503,undefined]
]) test("actual care PATCH: "+name,async()=>{
 const f=await fixture(),before=f.snapshot(),auth=globalThis.__gqAuth;
 let rpc=0;globalThis.__gqAuth=async r=>{const a=await auth(r);if(!("response"in a))a.supabase={...a.supabase,rpc:async()=>{rpc++;return{data:null,error}}};return a;};
 const r=await f.patch({input:f.input("Synthetic retained draft"),expectedUpdatedAt:f.row().updated_at}),body=await r.json();
 assert.equal(r.status,status);assert.equal(body.code,code);assert.equal(rpc,1);assert.equal(f.mutations,0);assert.deepEqual(f.snapshot(),before);
 if(status===409)assert.match(body.error,/changed after you opened.*Reopen/);else assert.doesNotMatch(body.error,/changed after you opened|Reopen/);
});
test("genuine opened old revision cannot overwrite newer row",async()=>{
 const f=await fixture(),old=f.row().updated_at;
 assert.equal((await f.patch({input:f.input("Newer survives"),expectedUpdatedAt:old})).status,200);
 const r=await f.patch({input:f.input("Stale retained draft"),expectedUpdatedAt:old});
 assert.equal(r.status,409);assert.equal((await r.json()).code,"CARE_ENTRY_STALE");
 assert.equal(f.row().note,"Newer survives");assert.equal(f.mutations,1);
});
test("missing revision is denied before any write/idempotency claim",async()=>{
 const f=await fixture();assert.equal((await f.patch({input:f.input()})).status,428);assert.equal(f.mutations,0);assert.equal(f.claims,0);
});
test("auth and tenant denial stay before mutation",async()=>{
 const f=await fixture();f.user=null;assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:f.row().updated_at})).status,401);
 f.user="91000000-0000-4000-8000-000000000099";assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:f.row().updated_at})).status,404);assert.equal(f.mutations,0);
});
test("same intent replays once; same key different payload remains conflict",async()=>{
 const f=await fixture(),rev=f.row().updated_at,key=crypto.randomUUID(),body={input:f.input("One confirmed edit"),expectedUpdatedAt:rev};
 assert.equal((await f.patch(body,key)).status,200);assert.equal((await f.patch(body,key)).status,200);assert.equal(f.mutations,1);
 const r=await f.patch({...body,input:f.input("Different")},key);assert.equal(r.status,409);assert.equal((await r.json()).code,"IDEMPOTENCY_CONFLICT");assert.equal(f.mutations,1);
});
test("actual browser transport retains ambiguous key and separates changed body/revision",async()=>{
 const f=await fixture();await withBrowserTransport(async api=>{
  const ss=storage();window.sessionStorage=ss;const sends=[];let fail=true;
  globalThis.fetch=async(url,opts)=>{sends.push({body:JSON.parse(opts.body),key:new Headers(opts.headers).get("Idempotency-Key")});if(fail)throw new TypeError("synthetic unknown outcome");return Response.json({entry:{id:entry}});};
  const rev=f.row().updated_at,note="OF_SYNTHETIC_PRIVATE_SENTINEL";
  await assert.rejects(api.updateCareEntry(entry,f.input(note),{},rev),/unknown outcome/);assert.equal(sends.length,1);
  await assert.rejects(api.updateCareEntry(entry,f.input(note),{},rev),/unknown outcome/);assert.equal(sends.length,2);assert.equal(sends[0].key,sends[1].key);
  assert.equal(sends[0].body.expectedUpdatedAt,rev);
  fail=false;await api.updateCareEntry(entry,f.input("Different deliberate edit"),{},rev);assert.notEqual(sends[0].key,sends[2].key);
  await api.updateCareEntry(entry,f.input(note),{},"2026-03-01T00:00:00.000Z");assert.notEqual(sends[0].key,sends[3].key);
  assert.equal(ss.m.size,1);for(const[k,v]of ss.m){assert.ok(!k.includes(note)&&!v.includes(note));assert.deepEqual(Object.keys(JSON.parse(v)).sort(),["createdAt","key"]);}
 });
});
test("unrelated billing-style mutation keeps its existing generic intent behavior",async()=>{
 const f=await fixture();await withBrowserTransport(async()=>{
  const ss=storage();window.sessionStorage=ss;const keys=[];globalThis.fetch=async(_url,init)=>{keys.push(new Headers(init.headers).get("Idempotency-Key"));return Response.json({error:"Unavailable"},{status:503})};
  await idempotentClientFetch("/api/billing/portal",{method:"POST",body:"first"},"POST:/api/billing/portal");
  await idempotentClientFetch("/api/billing/portal",{method:"POST",body:"other"},"POST:/api/billing/portal");
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(ss.m.size,1);
 });
});
for(const code of ["40001","PT409"])test("direct injected SDK update recognizes only "+code+" stale",async()=>{
 const f=await fixture();await withBrowserTransport(async api=>{
  const ctx=await globalThis.__gqAuth(new Request("https://fixture.invalid"));const db={...ctx.supabase,rpc:async()=>({data:null,error:{code,message:"CARE_ENTRY_STALE"}})};
  await assert.rejects(api.updateCareEntry(entry,f.input(),{getClient:()=>db,getCurrentUser:async()=>({id:f.user})},f.row().updated_at),/changed after you opened.*Reopen/);
  assert.equal(f.mutations,0);
 });
});
