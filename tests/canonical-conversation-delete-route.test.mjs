import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';import vm from'node:vm';import ts from'typescript';
import * as boundary from '../app/lib/security/request.ts';
import {parseAskConversationResponse}from'../app/lib/ask.mjs';
const owner='89500000-0000-4000-8000-000000000001',foreign='89500000-0000-4000-8000-000000000002',id='89500000-0000-4000-8000-000000000003';
function compile(rel,deps,extras={}){const exports={};const code=ts.transpileModule(readFileSync(new URL('../'+rel,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,Response,Request,URL,Buffer,console,require(name){assert.ok(Object.hasOwn(deps,name),'unreviewed import '+name);return deps[name];},...extras},{filename:rel});return exports;}
function fixture({rpcError=false,race=false,user=owner,authError=false}={}){
 const events=[],state={conversations:[{id,user_id:owner,pet_profile_id:id,title:'Fixture',status:'active',last_activity_at:'2026-01-01T00:00:00Z'}],messages:[{conversation_id:id,user_id:owner,role:'user',user_text:'Private fixture dialogue.'}],care:[{id:'saved',note:'Exact saved care.',updated_at:'stable'}]};
 const db={from(table){events.push(['query',table]);const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},neq(){return query;},order(){return query;},limit(){return query;},or(){return query;},is(){return query;},in(){return query;},lt(){return query;},maybeSingle(){return Promise.resolve({data:(state[table==='ask_conversations'?'conversations':'messages']||[]).find(row=>filters.every(([k,v])=>row[k]===v))??null,error:null});},returns(){return Promise.resolve({data:(state[table==='ask_conversations'?'conversations':'messages']||[]).filter(row=>filters.every(([k,v])=>row[k]===v)),error:null});}};return query;}};
 const rpc=async(name,args)=>{events.push(['rpc',name,args]);assert.equal(name,'delete_ask_conversation');assert.equal(args.p_user_id,user);assert.equal(args.p_conversation_id,id);if(rpcError)return{data:null,error:{code:'23514'},status:400};if(race)return{data:false,error:null};state.conversations=[];state.messages=[];return{data:true,error:null};};
 const authority=compile('app/lib/ask-conversation-authority.ts',{'server-only':{},'@supabase/supabase-js':{createClient:()=>({rpc})},'./security/idempotent-rpc-recovery.ts':{recoverIdempotentRpc(){throw Error('Unexpected recovery');}}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEY:'offline-placeholder'}}});
 const server={getAskConversationRequestContext:async()=>{events.push(['auth']);return authError?{response:Response.json({error:'fixture unauthorized'},{status:401})}:{userId:user,supabase:db};},toConversationSummary:x=>({id:x.id}),toConversationDetail(){throw Error('Deleted detail must not be built');},loadActionCapabilitiesForMessages(){throw Error('No deleted capabilities lookup');},reconcileAskSuggestions(){throw Error('No deleted suggestions lookup');}};
 const idem={beginIdempotentRateLimitedOperation:async input=>{events.push(['gate',input.retention,input.operationType]);return{operation:{execute:fn=>fn()}};}};
 const routes=compile('app/api/ask/conversations/[id]/route.ts',{'../../../../lib/ask-conversation-server':server,'../../../../lib/security/request':boundary,'../../../../lib/security/idempotency':idem,'../../../../lib/ask-conversation-authority':authority});
 const list=compile('app/api/ask/conversations/route.ts',{'../../../lib/ask.mjs':{parseAskConversationResponse},'../../../lib/ask-conversation-server':server,'../../../lib/ask-conversations':{},'../../../lib/ask-conversation-authority':authority,'../../../lib/security/request':boundary,'../../../lib/security/idempotency':idem});
 const messages=compile('app/api/ask/conversations/[id]/messages/route.ts',{'../../../../../lib/ask.mjs':{parseAskConversationResponse},'../../../../../lib/ask-conversation-server':server,'../../../../../lib/ask-conversation-authority':authority,'../../../../../lib/security/request':boundary,'../../../../../lib/security/idempotency':idem});
 const params={params:Promise.resolve({id})},url='https://fixture.invalid/api/ask/conversations/'+id;
 return{state,events,routes,list,messages,params,url};
}
test('actual delete authority forwards verified owner; list/detail/message routes do not reconstruct deleted dialogue',async()=>{
 const f=fixture(),saved=JSON.stringify(f.state.care);assert.equal((await f.routes.DELETE(new Request(f.url,{method:'DELETE'}),f.params)).status,204);
 assert.equal(JSON.stringify(f.state.care),saved);assert.equal(f.state.messages.length,0);
 assert.deepEqual((await(await f.list.GET(new Request(f.url.replace('/'+id,'')))).json()).conversations,[]);
 assert.equal((await f.routes.GET(new Request(f.url),f.params)).status,404);
 const response={title:'Fixture response',summary:'This is a fixture response.',sections:[],safetyNote:null};assert.ok(parseAskConversationResponse(response));
 assert.equal((await f.messages.POST(new Request(f.url+'/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'Fixture exchange',response})}),f.params)).status,404);
 assert.equal(f.events.filter(x=>x[0]==='rpc').length,1);assert.equal(f.events.some(x=>x[1]==='pet_care_entries'),false);
 assert.deepEqual(f.events.slice(0,4).map(x=>x[0]),['auth','gate','query','rpc']);
});
test('new repeated delete returns 404; distinct read/delete race false currently yields idempotent 204',async()=>{
 const f=fixture();await f.routes.DELETE(new Request(f.url,{method:'DELETE'}),f.params);assert.equal((await f.routes.DELETE(new Request(f.url,{method:'DELETE'}),f.params)).status,404);assert.equal(f.events.filter(x=>x[0]==='rpc').length,1);
 const r=fixture({race:true});assert.equal((await r.routes.DELETE(new Request(r.url,{method:'DELETE'}),r.params)).status,204);
});
for(const [opts,status]of [[{user:foreign},404],[{authError:true},401],[{rpcError:true},503]])test('actual delete route fail closed '+JSON.stringify(opts),async()=>{const f=fixture(opts),before=JSON.stringify(f.state);assert.equal((await f.routes.DELETE(new Request(f.url,{method:'DELETE'}),f.params)).status,status);assert.equal(JSON.stringify(f.state),before);assert.equal(f.events.filter(x=>x[0]==='rpc').length,opts.rpcError?1:0);});
// DB/RPC deletion and idempotency storage are declared fixture seams. These route
// checks are not SQL cascade, real idempotency replay, RLS or concurrency proof.
