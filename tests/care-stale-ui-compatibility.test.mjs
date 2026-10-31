import test from "node:test";
import assert from "node:assert/strict";
import {withEditor} from "./helpers/history-note-edit-ui.mjs";
for(const [name,error,isStale]of[
 ["legacy40001",{code:"40001",message:"CARE_ENTRY_STALE"},true],
 ["PT409",{code:"PT409",message:"CARE_ENTRY_STALE"},true],
 ["serialization",{code:"40001",message:"could not serialize access"},false],
 ["unavailable",{code:"PGRST003",message:"Unavailable"},false]
])test("actual History error UX/draft/no-overwrite: "+name,async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("OF synthetic retained draft");await ui.click("Review changes");
  f.row().note="OF newer survives";f.row().updated_at="2026-03-01T00:00:00.000Z";
  const auth=globalThis.__gqAuth;globalThis.__gqAuth=async r=>{const a=await auth(r);if(!("response"in a))a.supabase={...a.supabase,rpc:async()=>({data:null,error})};return a};
  await ui.click("Confirm save changes");assert.match(ui.text,/OF synthetic retained draft/);assert.equal(f.row().note,"OF newer survives");assert.equal(f.mutations,0);assert.equal(ui.calls.length,1);
  if(isStale)assert.match(ui.text,/changed after you opened.*Reopen/);else{assert.match(ui.text,/could not be saved/);assert.doesNotMatch(ui.text,/changed after you opened|Reopen/);}
  assert.doesNotMatch(ui.text,/Changes saved/);
 });
});
