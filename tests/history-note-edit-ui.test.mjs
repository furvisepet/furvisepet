import assert from "node:assert/strict";
import test from "node:test";
import {withEditor} from "./helpers/history-note-edit-ui.mjs";

test("actual editor offers explicit review/save/cancel and Cancel/Escape perform no mutation",async()=>{
 await withEditor(async(ui,f)=>{
  const before=f.snapshot();await ui.open();await ui.click("Edit note");await ui.draft("Synthetic draft");
  assert.equal(f.mutations,0);await ui.click("Review changes");assert.equal(f.mutations,0);
  await ui.click("Cancel edit");assert.deepEqual(f.snapshot(),before);assert.match(ui.text,/Synthetic original/);
  await ui.click("Edit note");await ui.draft("Another draft");await ui.escape();assert.deepEqual(f.snapshot(),before);
 });
});
test("actual UI -> browser transport -> authenticated PATCH persists exact revised note and checks returned revision",async()=>{
 await withEditor(async(ui,f)=>{
  const before=f.snapshot(),v=f.row().updated_at;await ui.open();await ui.click("Edit note");await ui.draft("Literal <b> & USER:\nsecond line");
  await ui.click("Review changes");assert.equal(f.mutations,0);await ui.click("Confirm save changes");
  assert.match(ui.text,/Changes saved\./);assert.equal(f.row().note,"Literal <b> & USER:\nsecond line");assert.notEqual(f.row().updated_at,v);
  const {note,updated_at,...stable}=f.row(),{note:old,updated_at:oldV,...original}=before[0];void note;void updated_at;void old;void oldV;
  assert.deepEqual(stable,original);assert.deepEqual(f.rows[1],before[1]);assert.equal(f.mutations,1);assert.equal(ui.marks,1);
 });
});
test("stale save keeps newer storage and user's draft with a clear reopen message",async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("Keep my unsaved draft");await ui.click("Review changes");
  f.row().note="Newer external note";f.row().updated_at="2026-02-01T00:00:00.000Z";
  await ui.click("Confirm save changes");assert.equal(f.row().note,"Newer external note");assert.equal(f.mutations,0);
  assert.match(ui.text,/Keep my unsaved draft/);assert.match(ui.text,/changed after you opened|Reopen/);assert.doesNotMatch(ui.text,/Changes saved/);
 });
});
test("blank/unchanged input cannot reach Save; failed request retains draft",async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft(" ");await ui.click("Review changes");assert.match(ui.text,/1 to 4,000/);assert.equal(f.mutations,0);
  await ui.draft("Synthetic original");await ui.click("Review changes");assert.match(ui.text,/Make a change/);assert.equal(f.mutations,0);
  await ui.draft("Keep on failure");await ui.click("Review changes");
  globalThis.fetch=async()=>{throw Error("Controlled offline save failure");};
  await ui.click("Confirm save changes");assert.match(ui.text,/Keep on failure/);assert.match(ui.text,/Controlled offline save failure/);assert.equal(f.mutations,0);
 });
});
test("auth loss and account switch during editing fail without overwriting or losing draft",async()=>{
 for(const user of [null,"91000000-0000-4000-8000-000000000004"])await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("Retained draft");await ui.click("Review changes");f.user=user;
  await ui.click("Confirm save changes");assert.equal(f.mutations,0);assert.match(ui.text,/Retained draft/);assert.doesNotMatch(ui.text,/Changes saved/);
 });
});
test("duplicate confirm handler cannot submit twice while a save is pending",async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("One save");await ui.click("Review changes");
  const b=ui.buttons().find(n=>n.props.children==="Confirm save changes");assert.ok(b);b.props.onClick();b.props.onClick();await ui.settle();
  assert.equal(f.mutations,1);assert.equal(ui.calls.length,1);
 });
});

test("invalid returned revision or subject cannot falsely confirm a save; draft stays visible",async()=>{
 for(const corrupt of ["revision","subject"])await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("Retain until verified");await ui.click("Review changes");
  const send=globalThis.fetch;globalThis.fetch=async(...args)=>{const r=await send(...args),b=await r.json();if(corrupt==="revision")b.entry.updated_at="invalid";else b.entry.pet_profile_id="wrong-subject";return Response.json(b,{status:r.status});};
  await ui.click("Confirm save changes");assert.match(ui.text,/Retain until verified/);assert.match(ui.text,/saved result needs checking/);assert.doesNotMatch(ui.text,/Changes saved/);assert.equal(ui.marks,0);
  assert.equal(f.mutations,1,"the test corrupts only the acknowledgement, not storage");
 });
});
test("an unauthenticated or nonowner view never exposes the note editor",async()=>{
 for(const user of [null,"91000000-0000-4000-8000-000000000004"])await withEditor(async(ui,f)=>{
  await ui.open();f.user=user;await ui.refresh();assert.equal(ui.buttons().some(n=>n.props.children==="Edit note"),false);assert.equal(f.mutations,0);
 });
});

test("distinct persisted microsecond revisions survive unchanged through UI, transport and PATCH",async()=>{
 await withEditor(async(ui,f)=>{
  await ui.open();await ui.click("Edit note");await ui.draft("Microsecond-safe edit");await ui.click("Review changes");await ui.click("Confirm save changes");
  assert.match(ui.text,/Changes saved/);assert.equal(f.row().updated_at,f.nextRevision);assert.equal(ui.marks,1);
  assert.equal(JSON.parse(ui.calls[0].options.body).expectedUpdatedAt,"2026-01-02T12:00:00.000001Z");
 },f=>{f.row().updated_at="2026-01-02T12:00:00.000001Z";f.nextRevision="2026-01-02T12:00:00.000002Z";});
});
