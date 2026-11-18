import test from "node:test";
import assert from "node:assert/strict";
import {fixture,withBrowserTransport,entry} from "./helpers/history-note-edit-contract.mjs";
import {withEditor} from "./helpers/history-note-edit-ui.mjs";

const storage=()=>{const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
async function transport(fn){
 const f=await fixture();
 return withBrowserTransport(async(api)=>{
  const ss=storage();window.sessionStorage=ss;const sends=[];
  globalThis.fetch=async(url,opts)=>{const send={body:opts.body,key:new Headers(opts.headers).get("Idempotency-Key")};sends.push(send);const response=await f.patch(JSON.parse(opts.body),send.key,entry);send.status=response.status;send.code=(await response.clone().json()).code;return response;};
  return fn({api,f,ss,sends,save:(note,v)=>api.updateCareEntry(entry,f.input(note),{},v)});
 });
}
test("different confirmed draft after a retained 503 uses a distinct intent; unresolved original stays retained",async()=>{
 await transport(async({f,ss,sends,save})=>{
  const v=f.row().updated_at;const auth=globalThis.__gqAuth;
  globalThis.__gqAuth=async r=>{const a=await auth(r);a.supabase={...a.supabase,rpc:async()=>({data:null,error:{code:"42501"}})};return a;};
  await assert.rejects(save("First deliberate draft",v),/could not be saved/);
  const retained=[...ss.m.entries()];assert.equal(retained.length,1);
  globalThis.__gqAuth=auth;
  await save("Second deliberate draft",v);
  assert.notEqual(sends[0].key,sends[1].key);assert.equal(f.row().note,"Second deliberate draft");
  for(const [k,val] of retained)assert.equal(ss.m.get(k),val);
  assert.equal(f.mutations,1);
 });
});
test("ambiguous network outcome retains identical intent/key and actual server replay mutates only once",async()=>{
 await transport(async({f,ss,sends,save})=>{
  const v=f.row().updated_at,fetch=globalThis.fetch;let lose=true;
  globalThis.fetch=async(...args)=>{const r=await fetch(...args);if(lose){lose=false;throw new TypeError("synthetic lost response");}return r;};
  await assert.rejects(save("One confirmed intent",v),/lost response/);assert.equal(ss.m.size,1);
  await save("One confirmed intent",v);assert.equal(sends[0].key,sends[1].key);assert.equal(f.mutations,1);assert.equal(ss.m.size,0);
 });
});
test("changed opened revision separates intents while true stale conflict keeps newer body",async()=>{
 await transport(async({f,sends,save})=>{
  const old=f.row().updated_at;
  const fetch=globalThis.fetch;let lose=true;
  globalThis.fetch=async(...a)=>{const r=await fetch(...a);if(lose){lose=false;throw new TypeError("lost");}return r;};
  await assert.rejects(save("Newer survives",old),/lost/);
  const current=f.row().updated_at;
  await assert.rejects(save("Stale draft",old),/changed after you opened/);
  assert.notEqual(sends[0].key,sends[1].key);assert.equal(f.row().note,"Newer survives");assert.equal(f.mutations,1);
  await save("Next explicit edit",current);assert.notEqual(sends[0].key,sends[2].key);assert.equal(f.mutations,2);
 });
});
test("same explicit key with changed payload remains server IDEMPOTENCY_CONFLICT without mutation",async()=>{
 const f=await fixture(),v=f.row().updated_at,key=crypto.randomUUID();
 assert.equal((await f.patch({input:f.input("First"),expectedUpdatedAt:v},key)).status,200);
 const r=await f.patch({input:f.input("Different"),expectedUpdatedAt:v},key);assert.equal(r.status,409);
 assert.equal((await r.json()).code,"IDEMPOTENCY_CONFLICT");assert.equal(f.mutations,1);assert.equal(f.row().note,"First");
});
test("actual History cancel sends nothing; actual stale UI preserves draft/newer revision and reopen instruction",async()=>{
 await withEditor(async(ui,f)=>{
  const ss=storage();window.sessionStorage=ss;
  await ui.open();await ui.click("Edit note");await ui.draft("Cancelled draft");await ui.click("Cancel edit");assert.equal(ui.calls.length,0);
  await ui.click("Edit note");await ui.draft("Stale retained draft");
  const old=f.row().updated_at;assert.equal((await f.patch({input:f.input("Independent newer"),expectedUpdatedAt:old})).status,200);
  await ui.click("Review changes");await ui.click("Confirm save changes");
  assert.match(ui.text,/changed after you opened/);assert.match(ui.text,/Stale retained draft/);
  assert.equal(f.row().note,"Independent newer");assert.equal(f.mutations,1);assert.equal(ui.calls.length,1);
 });
});

test("concurrent duplicates share one pending intent and server mutation",async()=>{
 await transport(async({f,sends,save})=>{
  const v=f.row().updated_at,fetch=globalThis.fetch;let release;const gate=new Promise(r=>release=r);
  globalThis.fetch=async(...args)=>{await gate;return fetch(...args);};
  const a=save("Concurrent literal",v),b=save("Concurrent literal",v);
  await new Promise(r=>setTimeout(r,30));release();const outcomes=await Promise.allSettled([a,b]);
  assert.ok(outcomes.some(r=>r.status==="fulfilled"));for(const r of outcomes)if(r.status==="rejected")assert.equal(r.reason.message,"This request is already being processed.");
  for(const send of sends)if(send.status===409)assert.equal(send.code,"REQUEST_IN_PROGRESS");else assert.equal(send.status,200);
  assert.equal(sends.length,2);assert.equal(sends[0].key,sends[1].key);assert.equal(f.mutations,1);
 });
});
test("storage retains only key/timestamp metadata, never literal note or request body",async()=>{
 await transport(async({f,ss,save})=>{
  const v=f.row().updated_at;globalThis.fetch=async()=>{throw new TypeError("synthetic ambiguity");};
  const note="SYNTHETIC_PRIVATE_SENTINEL_ＵＳＥＲ_<literal>";
  await assert.rejects(save(note,v),/ambiguity/);
  assert.equal(ss.m.size,1);
  for(const [k,value] of ss.m){assert.ok(!k.includes(note)&&!value.includes(note));assert.ok(!value.includes("expectedUpdatedAt"));assert.deepEqual(Object.keys(JSON.parse(value)).sort(),["createdAt","key"]);}
 });
});
