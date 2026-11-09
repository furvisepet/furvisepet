import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import test from "node:test";
import {fixture,owner,id} from "./helpers/canonical-suggestion.mjs";
import {PUBLIC_V1_CAPABILITIES} from "../app/lib/public-v1-capabilities.ts";

// A future reintroduced public feature flag must not restore write authority.
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.includes("/api/ask/")&&specifier.includes("public-v1-capabilities"))
  return {shortCircuit:true,url:"data:text/javascript,export const PUBLIC_V1_CAPABILITIES=Object.freeze({askMutations:true})"};
 return next(specifier,context);
}});
const {PATCH,request}=await import("./helpers/ask-read-only-action-routes.mjs");
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error("disabled public suggestion attempted network");};
function harness({kind="append",legacy=false,missing=false,foreign=false,terminal=false}={}){
 const f=fixture(kind);
 if(legacy){f.s.canonical_payload=null;f.s.canonical_capability_id=null;f.s.type=kind;f.s.payload={note:"Legacy detail",semanticTopic:"Unbound topic"};}
 if(missing)f.s=null;
 if(terminal){f.c.status="succeeded";f.c.receipt={status:"succeeded",id:f.c.id};}
 const before=structuredClone(f),networkStart=networkCalls,io=[];
 const supabase=new Proxy({},{get(_target,key){io.push(String(key));throw Error("disabled public suggestion attempted database access");}});
 return {f,before,io,networkStart,run:body=>{
  globalThis.__readOnlyMutationAuth={userId:foreign?id(99):owner,supabase};
  return PATCH(request("PATCH",body===undefined?{action:"save"}:body));
 },raw:body=>{
  globalThis.__readOnlyMutationAuth={userId:owner,supabase};
  return PATCH(new Request("https://fixture.invalid/api/ask/suggestions/"+id(1),{method:"PATCH",body}));
 }};
}
async function denied(h,response){
 assert.equal(response.status,409);
 const body=await response.json();assert.equal(body.code,"SUGGESTION_CONFLICT");
 assert.match(body.error,/cannot change saved information/i);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 assert.deepEqual(h.io,[]);assert.equal(networkCalls,h.networkStart);assert.deepEqual(h.f,h.before);
}
for(const action of ["save","dismiss","edit","monitor"])test("public read-only suggestion denies "+action+" with zero effects",async()=>{
 assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);
 const h=harness();await denied(h,await h.run({action,...(action==="edit"?{details:"Changed display"}:{})}));
});
for(const kind of ["append","replace","state_transition"])test("public PATCH cannot execute a stored "+kind+" capability",async()=>{
 const h=harness({kind});await denied(h,await h.run());
});
for(const kind of ["history","concern_opening","concern_resolution","memory"])test("public PATCH denies legacy "+kind+" without querying or executing it",async()=>{
 const h=harness({kind,legacy:true});await denied(h,await h.run());
});
test("public owner-preference denial cannot mark its private capability failed",async()=>{
 const h=harness({kind:"owner_preference"});await denied(h,await h.run());assert.equal(h.f.c.status,h.before.c.status);
});
test("public suggestion replay cannot execute or rewrite an existing terminal receipt",async()=>{
 const h=harness({terminal:true});await denied(h,await h.run());await denied(h,await h.run());
});
test("client canonical payload, job, pet and target fields confer no authority",async()=>{
 for(const key of ["canonical_payload","appendJob","petId","targetId"]){const h=harness();await denied(h,await h.run({action:"save",[key]:{}}));}
});
test("monitor cannot reach a factual or workflow RPC",async()=>{
 const h=harness({kind:"state_transition"});await denied(h,await h.run({action:"monitor"}));
});
test("public edit cannot invalidate or change canonical meaning",async()=>{
 const h=harness();await denied(h,await h.run({action:"edit",details:"New display text"}));
});
test("public legacy dismiss cannot mutate workflow state",async()=>{
 const h=harness({kind:"memory",legacy:true});await denied(h,await h.run({action:"dismiss"}));
});
test("missing and foreign stored suggestions have the same authenticated denial without lookup",async()=>{
 for(const options of [{missing:true},{foreign:true}]){const h=harness(options);await denied(h,await h.run());}
});
test("unrecognized intents and spoofed owner fields cannot enable public writes",async()=>{
 for(const body of [{action:"delete"},{action:"confirm",userId:id(99),ownerId:id(99),enabled:true},null,[],{action:"save",sql:"select private_data"}]){
  const h=harness();await denied(h,await h.run(body));
 }
});
test("disabled public suggestion handler does not parse even malformed input before denial",async()=>{
 const h=harness();await denied(h,await h.raw("{not json"));
});
