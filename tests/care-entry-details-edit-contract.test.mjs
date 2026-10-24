import assert from "node:assert/strict";
import test from "node:test";
import {fixture,id,owner,pet,entry,other,assertOwnedDetailsContract,assertClientRevisionContract,assertBrowserTransportContract} from "./helpers/care-entry-contract.mjs";
test("owned details are current versioned observations, never write/fact authority",assertOwnedDetailsContract);
test("reviewed client revision is required and survives to CAS, not replaced by reread",assertClientRevisionContract);
test("all normal browser gateways serialize time and edit retains reviewed revision",assertBrowserTransportContract);
test("details refuse wrong subject, missing, tombstoned, malformed and unauthenticated targets",async()=>{
 const f=await fixture();assert.equal((await f.details({subjectId:other})).status,404);assert.equal((await f.details({},id(99))).status,404);
 f.row().deleted_at="2026-01-03T00:00:00Z";assert.equal((await f.details()).status,404);f.row().deleted_at=null;
 assert.equal((await f.details({revision:"invalid"})).status,400);assert.equal((await f.details({bodySHA256:"invalid"})).status,400);
 f.user=null;assert.equal((await f.details()).status,401);assert.equal(f.mutations,0);assert.equal(f.claims,0);
});
test("changed source revision/hash cannot masquerade as matching expected snapshot",async()=>{
 const f=await fixture(),r=await f.details({revision:"2025-01-01T00:00:00Z",bodySHA256:"0".repeat(64)}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.matchesExpectedRevision,false);assert.equal(b.matchesExpectedBody,false);assert.equal(b.numericPremiseCertified,false);assert.equal(b.revision,f.row().updated_at);assert.equal(f.mutations,0);
});
test("query failure and cancellation return no source metadata or mutation",async()=>{
 const f=await fixture();f.queryError=true;let r=await f.details();assert.equal(r.status,503);assert.equal((await r.json()).recordId,undefined);
 f.queryError=false;const c=new AbortController();c.abort();r=await f.details({},entry,c.signal);assert.equal(r.status,503);assert.equal(f.mutations,0);
});
test("foreign owner/pet and body-auth injection deny before mutation claim",async()=>{
 const f=await fixture(),v=f.row().updated_at;
 f.user=other;assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:v})).status,404);f.user=owner;
 assert.equal((await f.patch({input:{...f.input(),petProfileId:other},expectedUpdatedAt:v})).status,404);
 assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:v,userId:other})).status,400);assert.equal(f.claims,0);assert.equal(f.mutations,0);
});
test("confirmed exact target changes note without rewriting unrelated fields or entries",async()=>{
 const f=await fixture(),before=f.snapshot(),v=f.row().updated_at,r=await f.patch({input:f.input(),expectedUpdatedAt:v}),b=await r.json();
 assert.equal(r.status,200);assert.equal(f.mutations,1);assert.equal(b.receipt.entryId,entry);assert.equal(b.receipt.subjectId,pet);
 const {note,updated_at,...stable}=f.row(),{note:oldNote,updated_at:oldV,...oldStable}=before[0];
 assert.notEqual(note,oldNote);assert.notEqual(updated_at,oldV);assert.deepEqual(stable,oldStable);assert.deepEqual(f.rows[1],before[1]);
 const fresh=await(await f.details({revision:updated_at})).json();assert.equal(fresh.matchesExpectedRevision,true);assert.equal(fresh.revision,updated_at);
});
test("exact confirmation replay returns immutable receipt with only one mutation",async()=>{
 const f=await fixture(),key=crypto.randomUUID(),body={input:f.input(),expectedUpdatedAt:f.row().updated_at};
 const a=await(await f.patch(body,key)).json(),r=await f.patch(body,key);assert.equal(r.status,200);assert.deepEqual(await r.json(),a);assert.equal(f.mutations,1);assert.equal(f.rates,1);
});
test("same-key changed proposal and competing reviewed edits cannot overwrite",async()=>{
 const f=await fixture(),v=f.row().updated_at,key=crypto.randomUUID();await f.patch({input:f.input(),expectedUpdatedAt:v},key);
 assert.equal((await f.patch({input:f.input("Conflicting payload"),expectedUpdatedAt:v},key)).status,409);assert.equal(f.mutations,1);
 const g=await fixture(),version=g.row().updated_at;
 const rs=await Promise.all(["Edit A","Edit B"].map(note=>g.patch({input:g.input(note),expectedUpdatedAt:version})));
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(g.mutations,1);
});
test("completion-ack loss cannot produce another mutation on the same confirmation key",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const f=await fixture();f.failComplete=true;const key=crypto.randomUUID(),body={input:f.input(),expectedUpdatedAt:f.row().updated_at};
 assert.equal((await f.patch(body,key)).status,503);assert.equal(f.mutations,1);
 assert.equal((await f.patch(body,key)).status,503);assert.equal(f.mutations,1);
});
test("malformed or absent revision/input never reaches persistence",async()=>{
 const f=await fixture();for(const v of[null,"invalid",undefined])assert.equal((await f.patch({input:f.input(),expectedUpdatedAt:v})).status,428);
 assert.equal((await f.patch({input:f.input(" "),expectedUpdatedAt:f.row().updated_at})).status,400);assert.equal(f.claims,0);assert.equal(f.mutations,0);
});
