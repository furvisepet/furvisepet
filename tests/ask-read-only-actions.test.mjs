import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {POST,PATCH,messageId,request} from "./helpers/ask-read-only-action-routes.mjs";
test("public Ask mutation endpoints retain authenticated denial without any database or provider access",async()=>{
 let calls=0;globalThis.__readOnlyMutationAuth={userId:"owner",supabase:new Proxy({},{get(){calls++;throw new Error("disabled endpoint attempted IO");}})};
 for(const id of [messageId,"22222222-2222-4222-8222-222222222222"]){
  const action=await POST(request(),{params:Promise.resolve({messageId:id})});assert.equal(action.status,404);
  assert.deepEqual(await action.json(),{error:"That action is no longer available."});assert.equal(action.headers.get("cache-control"),"private, no-store");
 }
 const suggestion=await PATCH(request("PATCH"));assert.equal(suggestion.status,409);assert.equal((await suggestion.json()).code,"SUGGESTION_CONFLICT");
 assert.equal(calls,0);
});
test("anonymous callers cannot use retired action or suggestion APIs",async()=>{
 globalThis.__readOnlyMutationAuth={response:new Response(null,{status:401})};
 assert.equal((await POST(request(),{params:Promise.resolve({messageId})})).status,401);
 const suggestion=await PATCH(request("PATCH"));assert.equal(suggestion.status,401);assert.equal((await suggestion.json()).code,"SUGGESTION_FORBIDDEN");
});
test("invalid action identities remain uniformly unavailable",async()=>{
 globalThis.__readOnlyMutationAuth={response:new Response(null,{status:401})};
 assert.equal((await POST(request(),{params:Promise.resolve({messageId:"invalid"})})).status,404);
});
test("read-only public handlers cannot import or dispatch privileged mutation execution even under a changed flag",()=>{
 for(const file of ["../app/api/ask/actions/[messageId]/route.ts","../app/api/ask/suggestions/[id]/route.ts"]){
  const source=readFileSync(new URL(file,import.meta.url),"utf8");
  for(const name of ["executeActionCapability","continueConfirmedAppend","continueCanonicalSuggestion","createCanonicalCareAuthorityClient",".rpc(","askMutations"])assert.ok(!source.includes(name),name);
 }
});

test("central origin rejection is preserved by both disabled endpoints",async()=>{
 globalThis.__readOnlyMutationAuth={response:Response.json({code:"ORIGIN_FORBIDDEN"},{status:403})};
 assert.equal((await POST(request(),{params:Promise.resolve({messageId})})).status,403);
 assert.equal((await PATCH(request("PATCH"))).status,403);
});
