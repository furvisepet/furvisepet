import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {fixture,withBrowserTransport,entry} from "./helpers/history-note-edit-contract.mjs";
import {withEditor} from "./helpers/history-note-edit-ui.mjs";

for(const [name,error,status,code]of[
 ["business PT409",{code:"PT409",message:"CARE_ENTRY_STALE"},409,"CARE_ENTRY_STALE"],
 ["unrelated PT409",{code:"PT409",message:"OTHER_CONFLICT"},503,undefined],
 ["backend unavailable",{code:"PGRST003",message:"Unavailable"},503,undefined],
 ["legacy rollout",{code:"40001",message:"CARE_ENTRY_STALE"},409,"CARE_ENTRY_STALE"]
])test("care update classifies "+name+" without overwriting",async()=>{
 const f=await fixture(),before=f.snapshot(),v=f.row().updated_at,auth=globalThis.__gqAuth;
 globalThis.__gqAuth=async r=>{const a=await auth(r);if(!("response"in a))a.supabase={...a.supabase,rpc:async()=>({data:null,error})};return a;};
 const r=await f.patch({input:f.input("Retained synthetic draft"),expectedUpdatedAt:v}),b=await r.json();
 assert.equal(r.status,status);assert.equal(b.code,code);assert.deepEqual(f.snapshot(),before);assert.equal(f.mutations,0);
 assert.match(r.headers.get("cache-control"),/private.*no-store/);
});

test("actual History UI preserves draft and newer body and explains canonical PT409",async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("Keep this synthetic draft");await ui.click("Review changes");
  f.row().note="Independent newer";f.row().updated_at="2026-02-01T00:00:00.000Z";
  const auth=globalThis.__gqAuth;
  globalThis.__gqAuth=async r=>{const a=await auth(r);if(!("response"in a))a.supabase={...a.supabase,rpc:async()=>({data:null,error:{code:"PT409",message:"CARE_ENTRY_STALE"}})};return a;};
  await ui.click("Confirm save changes");
  assert.match(ui.text,/Keep this synthetic draft/);assert.match(ui.text,/changed after you opened.*Reopen/);
  assert.equal(f.row().note,"Independent newer");assert.equal(f.mutations,0);assert.equal(ui.calls.length,1);assert.doesNotMatch(ui.text,/Changes saved/);
 });
});

test("unknown response retains confirmed intent and never automatically retries",async()=>{
 const f=await fixture();await withBrowserTransport(async api=>{
  const m=new Map();window.sessionStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
  let sends=0;globalThis.fetch=async()=>{sends++;throw new TypeError("Synthetic unknown outcome");};
  await assert.rejects(api.updateCareEntry(entry,f.input("Confirmed"),{},f.row().updated_at),/unknown outcome/);
  assert.equal(sends,1);assert.equal(m.size,1);assert.equal(f.mutations,0);
 });
});

test("forward migration preserves existing authority and fails closed on target drift",()=>{
 const files=readdirSync(new URL("../supabase/migrations/",import.meta.url)).filter(n=>n.endsWith("_care_entry_stale_business_sqlstate.sql"));assert.equal(files.length,1);
 const sql=readFileSync(new URL("../supabase/migrations/"+files[0],import.meta.url),"utf8");
 assert.match(sql,/pg_get_functiondef/);assert.match(sql,/v_match_count <> 2/);assert.match(sql,/PT409/);
 for(const property of["proowner","proacl","prosecdef","proconfig","proargtypes","prorettype","proretset"])assert.match(sql,new RegExp("v_after\\."+property+" is distinct from v_before\\."+property));
 assert.doesNotMatch(sql,/\b(?:grant|revoke|drop|pg_terminate_backend|alter\s+table)\b/i);
 const old=readFileSync(new URL("../supabase/migrations/20260823120001_add_controlled_care_entry_update_boundary.sql",import.meta.url),"utf8");
 const pattern=/errcode\s*=\s*'40001'\s*,\s*message\s*=\s*'CARE_ENTRY_STALE'/gi;
 assert.equal([...old.matchAll(pattern)].length,2);
 const newer=old.replace(pattern,"errcode = 'PT409', message = 'CARE_ENTRY_STALE'");
 assert.equal(newer.replaceAll("errcode = 'PT409', message = 'CARE_ENTRY_STALE'","errcode = '40001', message = 'CARE_ENTRY_STALE'"),old);
 assert.match(newer,/for update/);assert.match(newer,/entry\.updated_at = p_expected_updated_at/);
});
