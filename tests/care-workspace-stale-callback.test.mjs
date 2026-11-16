import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import {normalizeCareEntryDraft} from "../app/lib/care-log.mjs";
import {fixture,withBrowserTransport,entry} from "./helpers/history-note-edit-contract.mjs";
const ts=createRequire(import.meta.url)("typescript");
for(const [name,error,stale]of[
 ["legacy",{code:"40001",message:"CARE_ENTRY_STALE"},true],
 ["PT409",{code:"PT409",message:"CARE_ENTRY_STALE"},true],
 ["serialization",{code:"40001",message:"could not serialize access"},false]
])test("actual care workspace opened-revision save callback: "+name,async()=>{
 const f=await fixture(),opened=structuredClone(f.row()),draft=f.input("OF callback retained draft");
 f.row().note="OF newer callback row";f.row().updated_at="2026-03-01T00:00:00.000Z";
 await withBrowserTransport(async(api)=>{
  const auth=globalThis.__gqAuth;globalThis.__gqAuth=async r=>{const a=await auth(r);if(!("response"in a))a.supabase={...a.supabase,rpc:async()=>({data:null,error})};return a;};
  let sends=0;globalThis.fetch=async(_url,init)=>{sends++;const body=JSON.parse(init.body);assert.equal(body.expectedUpdatedAt,opened.updated_at);return f.patch(body,new Headers(init.headers).get("Idempotency-Key"),entry)};
  const src=readFileSync(new URL("../app/components/care-log-workspace.tsx",import.meta.url),"utf8"),a=src.indexOf("async function saveEntry("),b=src.indexOf("function handleSaved",a);assert.ok(a>0&&b>a);
  const js=ts.transpileModule(src.slice(a,b),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const save=vm.runInNewContext(js+";saveEntry",{normalizeCareEntryDraft,editingEntry:opened,updateCareEntry:api.updateCareEntry,createCareEntry:()=>{throw Error("create forbidden")}});
  await assert.rejects(save(draft),stale?/changed after you opened.*Reopen/:/could not be saved/);
  assert.equal(sends,1);assert.equal(draft.note,"OF callback retained draft");assert.equal(opened.updated_at,"2026-01-02T12:00:00.000Z");assert.equal(f.row().note,"OF newer callback row");assert.equal(f.mutations,0);
 });
});
