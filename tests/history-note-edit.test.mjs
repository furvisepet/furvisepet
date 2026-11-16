import assert from "node:assert/strict";
import test from "node:test";
import {fixture,id,entry,pet,other,withBrowserTransport,assertClientRevisionContract} from "./helpers/history-note-edit-contract.mjs";

test("opened revision is mandatory and is never replaced by a later read",assertClientRevisionContract);
test("owner saves exact literal note and persisted revision while identity/source/other rows remain unchanged",async()=>{
 const f=await fixture(),before=f.snapshot(),v=f.row().updated_at;
 const note="Synthetic literal <tag> & USER:\nquoted 'line' — １２３";
 const r=await f.patch({input:f.input(note),expectedUpdatedAt:v}),b=await r.json();
 assert.equal(r.status,200);assert.match(r.headers.get("cache-control"),/private.*no-store/);
 assert.equal(b.entry.note,note);assert.equal(b.receipt.previousRevision,v);assert.equal(b.receipt.revision,f.row().updated_at);
 assert.notEqual(b.receipt.revision,v);assert.equal(b.receipt.entryId,entry);assert.equal(b.receipt.subjectId,pet);
 const {note:_n,updated_at:_v,...stable}=f.row(),{note:_old,updated_at:_oldV,...original}=before[0];
 void _n;void _v;void _old;void _oldV;
 assert.deepEqual(stable,original);assert.deepEqual(f.rows[1],before[1]);assert.equal(f.mutations,1);
});
test("unauthenticated/nonowner/wrong-pet/body-auth injection never claims a mutation",async()=>{
 for(const kind of ["unauth","foreign","pet","injection"]){
  const f=await fixture(),v=f.row().updated_at,body={input:f.input(),expectedUpdatedAt:v};
  if(kind==="unauth")f.user=null;if(kind==="foreign")f.user=other;if(kind==="pet")body.input.petProfileId=other;if(kind==="injection")body.userId=other;
  const r=await f.patch(body);assert.equal(r.status,kind==="unauth"?401:kind==="injection"?400:404);
  assert.equal(f.claims,0);assert.equal(f.mutations,0);
 }
});
test("missing/tombstoned target and invalid revision reject without writes",async()=>{
 const f=await fixture(),v=f.row().updated_at;
 for(const revision of [undefined,null,"invalid"])assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:revision})).status,428);
 assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:v},undefined,id(99))).status,404);
 f.row().deleted_at="2026-01-03T00:00:00Z";assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:v})).status,404);
 assert.equal(f.mutations,0);
});
test("two concurrent editors cannot overwrite one another; exact replay mutates once",async()=>{
 const f=await fixture(),v=f.row().updated_at,results=await Promise.all(["Editor A","Editor B"].map(note=>f.patch({input:f.input(note),expectedUpdatedAt:v})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.mutations,1);
 const g=await fixture(),key=crypto.randomUUID(),body={input:g.input(),expectedUpdatedAt:g.row().updated_at};
 const a=await(await g.patch(body,key)).json(),b=await g.patch(body,key);assert.equal(b.status,200);assert.deepEqual(await b.json(),a);assert.equal(g.mutations,1);assert.equal(g.rates,1);
 assert.equal((await g.patch({...body,input:g.input("Different confirmation")},key)).status,409);assert.equal(g.mutations,1);
});
test("lost completion acknowledgement never causes a second mutation",async t=>{
 t.mock.method(console,"warn",()=>{});t.mock.method(console,"info",()=>{});
 const f=await fixture(),key=crypto.randomUUID(),body={input:f.input(),expectedUpdatedAt:f.row().updated_at};f.failComplete=true;
 assert.equal((await f.patch(body,key)).status,503);assert.equal((await f.patch(body,key)).status,503);assert.equal(f.mutations,1);
});
test("actual browser helper transports opened revision and refuses absent revision before fetch",async()=>{
 await withBrowserTransport(async(api,calls)=>{
  const input={petProfileId:pet,category:"general",title:"Synthetic",note:"Exact literal",severity:null,occurredAt:"2026-01-01T12:00:00.000Z"},v="2026-01-02T12:00:00.000Z";
  await api.updateCareEntry(entry,input,{},v);assert.equal(calls.length,1);assert.equal(calls[0].options.method,"PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body),{input,expectedUpdatedAt:v});
  assert.ok(new Headers(calls[0].options.headers).get("Idempotency-Key"));
  await assert.rejects(api.updateCareEntry(entry,input),/Reopen/);assert.equal(calls.length,1);
 });
});

test("existing care-log editor also sends its opened revision; create path remains create",async()=>{
 const {readFileSync}=await import("node:fs"),{createRequire}=await import("node:module"),vm=await import("node:vm");
 const ts=createRequire(import.meta.url)("typescript"),source=readFileSync(new URL("../app/components/care-log-workspace.tsx",import.meta.url),"utf8");
 const ast=ts.createSourceFile("care-log-workspace.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let save;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==="saveEntry")save=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(save);
 await withBrowserTransport(async(api,calls)=>{
  const normalized=(await import("../app/lib/care-log.mjs")).normalizeCareEntryDraft,revision="2026-01-02T12:00:00.000Z";
  let created=0;const compiledModule={exports:{}},ctx={module:compiledModule,exports:compiledModule.exports,editingEntry:{id:entry,updated_at:revision},normalizeCareEntryDraft:normalized,updateCareEntry:api.updateCareEntry,createCareEntry:async()=>{created++;return{id:"synthetic-created"};}};
  vm.runInNewContext(ts.transpileModule(save+"\nexport {saveEntry};",{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  const input={petProfileId:pet,category:"general",title:"Synthetic",note:"Care log edit",severity:null,occurredAt:"2026-01-01T12:00:00.000Z"};
  await compiledModule.exports.saveEntry(input);assert.equal(JSON.parse(calls[0].options.body).expectedUpdatedAt,revision);assert.equal(created,0);
  ctx.editingEntry=null;await compiledModule.exports.saveEntry(input);assert.equal(created,1);assert.equal(calls.length,1);
 });
});
