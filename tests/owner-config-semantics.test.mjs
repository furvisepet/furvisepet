import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {isFurviseOwner,FURVISE_OWNER_ID} from '../app/lib/operations/owner-access.ts';
let databaseCalls=0,databaseClients=0,networkCalls=0;
globalThis.__configOwnerTest={auth:{response:Response.json({}, {status:401})}};
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {shortCircuit:true,url:'data:text/javascript,export default {}'};
 if(s.endsWith('/authenticated-api-server'))return {shortCircuit:true,url:'data:text/javascript,export const getAuthenticatedApiContext=async()=>globalThis.__configOwnerTest.auth'};
 if(s.endsWith('/admin-client'))return {shortCircuit:true,url:'data:text/javascript,export const createOperationsAdminClient=()=>globalThis.__configOwnerDb()'};
 if(s.startsWith('.')){const u=new URL(s,c.parentURL);if(existsSync(new URL(u.href+'.ts')))return next(u.href+'.ts',c);}
 return next(s,c);
}});
globalThis.__configOwnerDb=()=>{databaseClients++;return {rpc:async()=>{databaseCalls++;return {data:{safeMetric:true},error:null};}};};
globalThis.fetch=async()=>{networkCalls++;throw Error('OFFLINE_NETWORK_DENIED');};
const {ownerConfigurationSemantics}=await import('../app/lib/operations/owner-config-semantics.ts');
const {GET}=await import('../app/api/admin/dashboard/route.ts');
const {getAiGuardConfig,isAiFeatureEnabled,isAiMemoryExtractionEnabled}=await import('../app/lib/ai/usage-guard/config.ts');
const expected='abcdefghijklmnopqrst';
const base={NODE_ENV:'production',VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://'+expected+'.supabase.co',FURVISE_AI_DAILY_CALL_LIMIT:'9',FURVISE_AI_DAILY_COST_LIMIT_USD:'0.125'};
function req(query='scope=config',header=expected){
 return new Request('https://www.furvise.com/api/admin/dashboard?'+query,{headers:header===null?{}:{'x-furvise-expected-backend-project':header}});
}
test('semantic view uses actual AI configuration predicates for boundary fixtures',()=>{
 for(const val of [undefined,'false','true','FALSE','', '0']){
  const env={...base,FURVISE_AI_ENABLED:val,FURVISE_AI_ASK_ENABLED:val,FURVISE_AI_CARE_PLAN_ENABLED:val,FURVISE_AI_PRODUCTS_ENABLED:val,FURVISE_AI_VET_BRIEF_ENABLED:val,FURVISE_AI_SAFETY_FOLLOWUP_ENABLED:val,FURVISE_AI_MEMORY_EXTRACTION_ENABLED:val};
  const r=ownerConfigurationSemantics(env,expected);
  assert.equal(r.ai.enabled,getAiGuardConfig(env).enabled);
  for(const [key,feature] of [['ask','ask'],['carePlan','care_plan'],['products','product_query'],['vetBrief','vet_brief'],['safetyFollowup','safety_followup']])assert.equal(r.ai[key],isAiFeatureEnabled(feature,env));
  assert.equal(r.ai.memoryExtraction,isAiMemoryExtractionEnabled(env));
 }
});
test('positive/invalid/overflow budget inputs follow authoritative guard and never return amounts',()=>{
 for(const calls of [undefined,'0','-1','1','1.1','NaN','9007199254740992']){
  for(const cost of [undefined,'0','-1','0.000001','0.125','1e9','9007199254740992']){
   const env={...base,FURVISE_AI_DAILY_CALL_LIMIT:calls,FURVISE_AI_DAILY_COST_LIMIT_USD:cost};
   const r=ownerConfigurationSemantics(env,expected);
   assert.equal(r.ai.dailyLimitsConfigured,getAiGuardConfig(env).configured);
   assert.ok(!('callLimit' in r.ai));assert.ok(!('costLimitMicrodollars' in r.ai));
  }
 }
});
test('backend predicate distinguishes intended, foreign, malformed and absent expected context without echo',()=>{
 assert.equal(ownerConfigurationSemantics(base,expected).backend.expectedProjectMatches,true);
 assert.equal(ownerConfigurationSemantics(base,'zzzzzzzzzzzzzzzzzzzz').backend.expectedProjectMatches,false);
 assert.equal(ownerConfigurationSemantics(base).backend.expectedProjectMatches,null);
 for(const value of ['http://'+expected+'.supabase.co','https://secret@'+expected+'.supabase.co','https://'+expected+'.supabase.co/path','https://'+expected+'.supabase.co/?private=sentinel','not-a-url']){
  const r=ownerConfigurationSemantics({...base,NEXT_PUBLIC_SUPABASE_URL:value},expected);
  assert.equal(r.backend.publicUrlWellFormed,false);assert.equal(r.backend.expectedProjectMatches,false);
  assert.ok(!JSON.stringify(r).includes(value));
 }
});
test('closed semantic view does not read secrets, enumerate env or serialize payloads',()=>{
 const allowed=new Set([...Object.keys(base),'FURVISE_AI_ENABLED','FURVISE_AI_ASK_ENABLED','FURVISE_AI_CARE_PLAN_ENABLED','FURVISE_AI_PRODUCTS_ENABLED','FURVISE_AI_VET_BRIEF_ENABLED','FURVISE_AI_SAFETY_FOLLOWUP_ENABLED','FURVISE_AI_MEMORY_EXTRACTION_ENABLED','NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED','NEXT_PUBLIC_GOOGLE_AUTH_ENABLED']);
 const env=new Proxy(base,{get(t,k){assert.ok(allowed.has(k),'unexpected environment read');return t[k];},ownKeys(){throw Error('ENV_ENUMERATION_DENIED');}});
 const r=ownerConfigurationSemantics(env,expected),text=JSON.stringify(r);
 assert.ok(!text.includes(expected));assert.ok(!text.includes(base.NEXT_PUBLIC_SUPABASE_URL));
 function check(x){for(const [k,v] of Object.entries(x)){if(v&&typeof v==='object')check(v);else if(!['schemaVersion','scope'].includes(k))assert.ok(typeof v==='boolean'||v===null,k);}}
 check(r);assert.equal(r.notReadinessDecision,true);assert.ok(!('ready' in r));
});
test('production, preview and auth booleans use real exact flag semantics',()=>{
 const r=ownerConfigurationSemantics({...base,VERCEL_ENV:'preview',NEXT_PUBLIC_AUTH_CAPTCHA_ENABLED:'false',NEXT_PUBLIC_GOOGLE_AUTH_ENABLED:'true'});
 assert.equal(r.productionContext,false);assert.equal(r.previewContext,true);assert.equal(r.auth.captchaEnabled,false);assert.equal(r.auth.googleEnabled,true);
});
test('real owner guard denies signed-out, nonowner, forged and anonymous identities before config response',async()=>{
 for(const auth of [{response:Response.json({}, {status:401})},{user:{id:'ordinary',user_metadata:{role:'owner',id:FURVISE_OWNER_ID}},userId:'ordinary'},{user:{id:FURVISE_OWNER_ID,is_anonymous:true},userId:FURVISE_OWNER_ID}]){
  globalThis.__configOwnerTest.auth=auth;databaseCalls=0;
  const r=await GET(req('scope=config&owner=true&keys=SUPABASE_SECRET_KEY','malformed'));
  assert.equal(r.status,'response' in auth?401:404);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(databaseCalls,0);
 }
 assert.equal(isFurviseOwner({id:'ordinary',user_metadata:{id:FURVISE_OWNER_ID}}),false);
});
test('real route config scope is owner-only, private/no-store, bounded and bypasses all dashboard data work',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};databaseCalls=0;
 const r=await GET(req('scope=config&days=1000000&includeTests=true&keys=SUPABASE_SECRET_KEY'));
 assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private/);assert.match(r.headers.get('cache-control'),/no-store/);
 const body=await r.json();assert.equal(body.scope,'config-semantics');assert.equal(body.notReadinessDecision,true);
 assert.equal(databaseCalls,0);assert.equal(networkCalls,0);assert.ok(!JSON.stringify(body).includes(FURVISE_OWNER_ID));
});
test('malformed or missing observation context is rejected without metrics access',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};databaseCalls=0;
 for(const value of ['x','A'.repeat(20),'a'.repeat(21),'https://'+expected+'.supabase.co','a'.repeat(1000)]){
  const r=await GET(req('scope=config',value));assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Invalid configuration observation context.'});assert.equal(databaseCalls,0);
 }
 const r=await GET(req('scope=config',null));assert.equal(r.status,400);assert.equal(databaseCalls,0);
});
test('existing metrics handler behavior remains bounded and unchanged',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};databaseCalls=0;
 assert.equal((await GET(req('days=30',null))).status,200);assert.equal(databaseCalls,1);
 assert.equal((await GET(req('days=1000',null))).status,400);assert.equal(databaseCalls,1);assert.equal(networkCalls,0);
});

test('explicit observation input never falls back to a host Google flag',()=>{
 const before=process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
 try{
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED='true';
  assert.equal(ownerConfigurationSemantics(base).auth.googleEnabled,false);
 }finally{
  if(before===undefined)delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  else process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=before;
 }
});

test('each feature changes independently without cross-wiring another control',()=>{
 for(const [flag,field] of [['FURVISE_AI_ASK_ENABLED','ask'],['FURVISE_AI_CARE_PLAN_ENABLED','carePlan'],['FURVISE_AI_PRODUCTS_ENABLED','products'],['FURVISE_AI_VET_BRIEF_ENABLED','vetBrief'],['FURVISE_AI_SAFETY_FOLLOWUP_ENABLED','safetyFollowup'],['FURVISE_AI_MEMORY_EXTRACTION_ENABLED','memoryExtraction']]){
  const r=ownerConfigurationSemantics({...base,[flag]:'false'},expected);
  for(const key of ['ask','carePlan','products','vetBrief','safetyFollowup','memoryExtraction'])assert.equal(r.ai[key],key!==field,flag+' -> '+key);
  assert.equal(r.ai.enabled,true);assert.equal(r.ai.dailyLimitsConfigured,true);
 }
});

test('real response compares fresh runtime input, rejects a stale expectation and never echoes either identity',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};
 const key='NEXT_PUBLIC_SUPABASE_URL',before=process.env[key],other='zzzzzzzzzzzzzzzzzzzz';
 try {
  process.env[key]='https://'+expected+'.supabase.co';
  let r=await GET(req());assert.equal(r.status,200);
  assert.equal((await r.json()).backend.expectedProjectMatches,true);
  process.env[key]='https://'+other+'.supabase.co';
  r=await GET(req());assert.equal(r.status,200);
  const text=await r.text(),body=JSON.parse(text);
  assert.equal(body.backend.expectedProjectMatches,false);
  assert.ok(!text.includes(expected));assert.ok(!text.includes(other));
  assert.equal((await (await GET(req('scope=config',other))).json()).backend.expectedProjectMatches,true);
  process.env[key]='malformed-runtime-value';
  const invalid=await (await GET(req())).json();
  assert.equal(invalid.backend.publicUrlWellFormed,false);
  assert.equal(invalid.backend.expectedProjectMatches,false);
 } finally {if(before===undefined)delete process.env[key];else process.env[key]=before;}
});

test('config response has a closed semantic schema with no readiness, data, credentials, amounts or hashes',async(t)=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};
 const logs=[];for(const name of ['log','info','warn','error','debug'])t.mock.method(console,name,(...args)=>logs.push(args));
 const r=await GET(req());assert.equal(r.status,200);
 assert.deepEqual([...r.headers.keys()].sort(),['cache-control','content-type','expires','pragma']);
 assert.equal(r.headers.get('cache-control'),'private, no-cache, no-store, must-revalidate, max-age=0');
 const b=await r.json();
 assert.deepEqual(Object.keys(b).sort(),['schemaVersion','scope','notReadinessDecision','productionContext','previewContext','nodeProduction','ai','auth','backend'].sort());
 assert.deepEqual(Object.keys(b.ai).sort(),['enabled','dailyLimitsConfigured','ask','carePlan','products','vetBrief','safetyFollowup','memoryExtraction'].sort());
 assert.deepEqual(Object.keys(b.auth).sort(),['captchaEnabled','googleEnabled'].sort());
 assert.deepEqual(Object.keys(b.backend).sort(),['publicUrlWellFormed','expectedProjectMatches'].sort());
 for(const group of [b.ai,b.auth,b.backend])for(const value of Object.values(group))assert.equal(typeof value,'boolean');
 assert.equal(b.notReadinessDecision,true);assert.equal(b.schemaVersion,1);assert.equal(b.scope,'config-semantics');
 assert.deepEqual(logs,[]);assert.equal(networkCalls,0);
});

test('unsafe observation headers are fixed private errors without echo or side effects',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};databaseCalls=0;
 for(const value of [null,'','a'.repeat(19),'a'.repeat(21),'a'.repeat(20)+', '+expected,'https://'+expected+'.supabase.co','a'.repeat(10000),'../'+expected,'A'.repeat(20)]){
  const r=await GET(req('scope=config',value));
  assert.equal(r.status,400);assert.match(r.headers.get('cache-control'),/private.*no-store/);
  assert.deepEqual(await r.json(),{error:'Invalid configuration observation context.'});
 }
 assert.equal(databaseCalls,0);assert.equal(networkCalls,0);
});

test('malformed direct-helper expected input remains unknown rather than matching configured identity',()=>{
 for(const value of ['', 'X'.repeat(20),'../'+expected,'a'.repeat(1000)]){
  const b=ownerConfigurationSemantics(base,value);
  assert.equal(b.backend.expectedProjectMatches,null);
 }
});

test('config branch never constructs a privileged database client or invokes dashboard RPC',async()=>{
 globalThis.__configOwnerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};
 databaseClients=0;databaseCalls=0;
 assert.equal((await GET(req())).status,200);
 assert.equal((await GET(req('scope=config',null))).status,400);
 assert.equal(databaseClients,0);assert.equal(databaseCalls,0);assert.equal(networkCalls,0);
});
