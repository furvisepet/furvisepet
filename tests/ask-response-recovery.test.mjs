import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
const functions=['GET','loadPersistedRequest'];
const code=ts.transpileModule(ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&functions.includes(node.name?.text)).map(node=>node.getText(ast).replace(/^export /,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const requestId='00000000-0000-4000-8000-000000000001',petId='00000000-0000-4000-8000-000000000002';
function fixture({stage='COMPLETED',owner='owner',pet=petId,absent=false,auth=true}={}){
 const queries=[],serialized=[];
 const supabase={from(table){const filters={};queries.push({table,filters});const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},order:()=>q,abortSignal:()=>q,
  returns:async()=>({error:null,data:absent||filters.user_id!==owner?[]:[{id:'u',role:'user',conversation_id:'conversation',sequence_number:0},{id:'a',role:'furvise',conversation_id:'conversation',response_data:{turn:{finalStage:stage}}}]}),
  maybeSingle:async()=>({error:null,data:filters.user_id===owner&&filters.pet_profile_id===pet?{id:'conversation'}:null})};return q;}};
 class AskApiError extends Error{constructor(code,message,status){super(message);this.code=code;this.status=status;}}
 const sandbox={Response,URL,loadAskRequestContext:async()=>auth?{userId:'owner',supabase,usage:{remaining:7}}:{response:Response.json({code:'AUTH_REQUIRED'},{status:401})},
  isUuid:value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  askFailure:(code,message,status)=>Response.json({code,message},{status}),AskApiError,
  handleAskApiError:error=>Response.json({code:error.code},{status:error.status}),recoverTransientRead:fn=>fn(new AbortController().signal),
  completedResponseFromPersisted:(state,usage)=>{serialized.push(state);return Response.json({success:true,usage,answer:'stored',creditsUsed:0});}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 return {get:(query=`?requestId=${requestId}&petId=${petId}`)=>sandbox.GET(new Request('https://furvise.com/api/ask'+query)),queries,serialized};
}
test('recovery reads the same owned pet request and only publishes a completed answer',async()=>{
 const f=fixture(),r=await f.get();assert.equal(r.status,200);assert.equal((await r.json()).answer,'stored');
 assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(f.serialized.length,1);
 assert.deepEqual(f.queries,[{table:'ask_conversation_messages',filters:{user_id:'owner',request_id:requestId}},
 {table:'ask_conversations',filters:{id:'conversation',pet_profile_id:petId,user_id:'owner'}}]);
});
test('foreign owners, wrong pets, absent and unfinished requests cannot publish stored answers',async()=>{
 for(const options of [{owner:'other'},{pet:'other'},{absent:true},{stage:'PERSISTED'},{stage:undefined}]){
  if(Object.hasOwn(options,'stage')&&options.stage===undefined)options.stage=null;
  const f=fixture(options),r=await f.get();assert.ok([202,404].includes(r.status));assert.equal(f.serialized.length,0);
 }
});
test('authentication and valid IDs precede recovery reads; existing usage GET remains intact',async()=>{
 const denied=fixture({auth:false});assert.equal((await denied.get()).status,401);assert.equal(denied.queries.length,0);
 const invalid=fixture();assert.equal((await invalid.get('?requestId=bad&petId='+petId)).status,400);assert.equal(invalid.queries.length,0);
 const usage=fixture();assert.deepEqual(await (await usage.get('')).json(),{usage:{remaining:7}});assert.equal(usage.queries.length,0);
});
