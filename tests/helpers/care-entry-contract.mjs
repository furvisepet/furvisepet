import assert from "node:assert/strict";
import {registerHooks,createRequire} from "node:module";
import Module from "node:module";
import {readFileSync,existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveAuthenticatedApiContext} from "../../app/lib/authenticated-api-core.ts";
registerHooks({
 resolve(s,c,next){const p=decodeURIComponent(c.parentURL||"");
  if(p.endsWith("/app/api/care-entries/[id]/route.ts")&&s.includes("authenticated-api-server"))return{url:"gq:auth",shortCircuit:true};
  if(p.includes("/security/idempotency/")&&s.endsWith("admin-client"))return{url:"gq:admin",shortCircuit:true};
  if(p.endsWith("/security/idempotency/operation.ts")&&s==="../rate-limit")return{url:"gq:rate",shortCircuit:true};
  return next(s,c);
 },
 load(u,c,next){
  if(u==="gq:auth")return{format:"module",source:"export const getAuthenticatedApiContext=r=>globalThis.__gqAuth(r);",shortCircuit:true};
  if(u==="gq:admin")return{format:"module",source:"export const createIdempotencyAdminClient=()=>globalThis.__gqAdmin;",shortCircuit:true};
  if(u==="gq:rate")return{format:"module",source:"export const beginRateLimitedRequest=i=>globalThis.__gqRate(i);",shortCircuit:true};
  return next(u,c);
 }
});
export const id=n=>"91000000-0000-4000-8000-"+String(n).padStart(12,"0");
export const owner=id(1),pet=id(2),entry=id(3),other=id(4);
export async function fixture(){
 const s={user:owner,mutations:0,claims:0,rates:0,operations:new Map(),failComplete:false,aborted:false,queryError:false};
 s.rows=[{id:entry,user_id:owner,pet_profile_id:pet,category:"general",title:"QA contract",note:"Synthetic original",severity:null,occurred_at:"2026-01-01T12:00:00.000Z",created_at:"2026-01-01T12:01:00.000Z",updated_at:"2026-01-02T12:00:00.000Z",deleted_at:null,intelligence_source_message_id:null,care_event_metadata:{preserved:"synthetic"}},
 {id:other,user_id:owner,pet_profile_id:pet,category:"general",title:"Unrelated",note:"Must remain exact",severity:null,occurred_at:"2026-01-01T12:00:00.000Z",created_at:"2026-01-01T12:01:00.000Z",updated_at:"2026-01-02T12:00:00.000Z",deleted_at:null}];
 const thenable=x=>{const p=Promise.resolve(x);p.abortSignal=()=>p;return p;};
 globalThis.__gqAdmin={rpc(name,a){
  const k=[a.p_user_id,a.p_operation_type,a.p_idempotency_key].join(":");
  if(name==="claim_idempotency_operation"){
   s.claims++;const old=s.operations.get(k);
   if(old){if(old.hash!==a.p_payload_hash)return thenable({data:[{claim_outcome:"conflict"}],error:null});
    if(old.body!==undefined)return thenable({data:[{claim_outcome:"completed",response_status:old.status,response_body:old.body}],error:null});
    return thenable({data:[{claim_outcome:"in_progress",retry_after_seconds:1}],error:null});}
   const o={hash:a.p_payload_hash,operation_id:crypto.randomUUID(),owner_token:crypto.randomUUID()};s.operations.set(k,o);return thenable({data:[{...o,claim_outcome:"new"}],error:null});
  }
  if(name==="complete_idempotency_operation"){
   if(s.failComplete)return thenable({data:false,error:{code:"CONTROLLED_LOST_COMPLETION"}});
   Object.assign(s.operations.get(k),{body:a.p_response_body,status:a.p_response_status});return thenable({data:true,error:null});
  }
  if(name==="fail_idempotency_operation"){Object.assign(s.operations.get(k),{body:a.p_response_body,status:a.p_response_status});return thenable({data:true,error:null});}
  if(name==="abandon_idempotency_operation")return thenable({data:true,error:null});
  throw Error("unexpected_storage_rpc:"+name);
 }};
 globalThis.__gqRate=async i=>{assert.equal(i.policy,"CARE_WRITE");assert.equal(i.userId,s.user);s.rates++;return{allowed:true};};
 const db={from(table){
  const filters=[];let max=Infinity;let signal;
  const rows=()=>{let rs=table==="dog_profiles"?[{id:pet,user_id:owner}]:s.rows;assert(["dog_profiles","pet_care_entries"].includes(table));assert(filters.some(([k,v])=>k==="user_id"&&v===s.user),"scope must use authenticated user");
   return rs.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(0,max);};
  const result=()=>({data:s.queryError?null:structuredClone(rows()),error:s.queryError?{code:"CONTROLLED_QUERY_FAILURE"}:null});
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},limit(n){max=n;return q},abortSignal(v){signal=v;return q},async returns(){if(signal?.aborted)s.aborted=true;return result()},async maybeSingle(){const r=result();return{data:r.data?.length===1?r.data[0]:null,error:r.error}}};return q;
 },async rpc(name,a){
  assert.equal(name,"update_my_care_entry");await Promise.resolve();
  const row=s.rows.find(r=>r.id===a.p_entry_id&&r.user_id===s.user&&r.pet_profile_id===a.p_pet_profile_id&&!r.deleted_at);
  if(!row)return{data:null,error:{code:"P0002"}};
  if(a.p_expected_updated_at!==row.updated_at)return{data:null,error:{code:"40001",message:"CARE_ENTRY_STALE"}};
  s.mutations++;Object.assign(row,{category:a.p_category,title:a.p_title,note:a.p_note,severity:a.p_severity,occurred_at:a.p_occurred_at,updated_at:new Date(Date.UTC(2026,0,3,12,0,s.mutations)).toISOString()});
  return{data:[structuredClone(row)],error:null};
 }};
 globalThis.__gqAuth=async req=>{
  const client={auth:{getUser:async()=>({data:{user:s.user?{id:s.user,email_confirmed_at:"2026-01-01T00:00:00Z"}:null},error:null})}};
  const a=await resolveAuthenticatedApiContext(req,{configurationAvailable:true,createBearerClient:()=>client,createCookieClient:()=>client});
  return "response"in a?a:{...a,supabase:db};
 };
 const {GET,PATCH}=await import("../../app/api/care-entries/[id]/route.ts");
 s.row=()=>s.rows[0];s.snapshot=()=>structuredClone(s.rows);
 s.input=(note="Synthetic revised")=>({petProfileId:pet,category:s.row().category,title:s.row().title,note,severity:s.row().severity,occurredAt:s.row().occurred_at});
 s.details=(params={},target=entry,signal)=>GET(new Request("https://fixture.invalid/api/care-entries/"+target+"?"+new URLSearchParams({subjectId:pet,...params}),{signal}),{params:Promise.resolve({id:target})});
 s.patch=(body,key=crypto.randomUUID(),target=entry)=>PATCH(new Request("https://fixture.invalid/api/care-entries/"+target,{method:"PATCH",headers:{"content-type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)}),{params:Promise.resolve({id:target})});
 return s;
}
export async function assertOwnedDetailsContract(){
 const f=await fixture(),before=f.snapshot(),r=await f.details({revision:f.row().updated_at,action:"edit",userId:other}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.recordId,entry);assert.equal(b.subjectId,pet);assert.equal(b.revision,f.row().updated_at);
 assert.equal(b.authority,"attributed_saved_contents_only");assert.equal(b.numericPremiseCertified,false);assert.equal(b.matchesExpectedRevision,true);
 assert.equal(b.actions,undefined);assert.equal(b.pendingAction,undefined);assert.match(r.headers.get("cache-control"),/no-store/);
 assert.equal(f.mutations,0);assert.equal(f.claims,0);assert.deepEqual(f.snapshot(),before);
 f.user=other;assert.equal((await f.details()).status,404);assert.equal(f.mutations,0);
}
export async function assertClientRevisionContract(){
 const f=await fixture(),old=f.row().updated_at;
 assert.equal((await f.patch({input:f.input()})).status,428);assert.equal(f.claims,0);
 const ok=await f.patch({input:f.input(),expectedUpdatedAt:old});assert.equal(ok.status,200);
 const b=await ok.json();assert.equal(b.receipt.previousRevision,old);assert.equal(b.receipt.revision,f.row().updated_at);
 const stale=await f.patch({input:f.input("Cannot overwrite"),expectedUpdatedAt:old});assert.equal(stale.status,409);assert.equal((await stale.json()).code,"CARE_ENTRY_STALE");assert.equal(f.mutations,1);assert.equal(f.row().note,"Synthetic revised");
}
export async function withBrowserTransport(fn){
 const file=fileURLToPath(new URL("../../app/lib/supabase.ts",import.meta.url)),req=createRequire(file),ts=req("typescript"),prior={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,processURL:process.env.NEXT_PUBLIC_SUPABASE_URL,processKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 const calls=[];globalThis.window={localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout,clearTimeout};globalThis.document={cookie:""};
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://fixture.invalid";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="supporting-only";
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({entry:{id:entry}});};
 const modules=new Map();
 function compile(filename){
  if(modules.has(filename))return modules.get(filename).exports;
  const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));modules.set(filename,m);
  const local=createRequire(filename);
  m.require=s=>{
   if(s==="@supabase/ssr")return{createBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"supporting-only",user:{id:owner}}},error:null})}})};
   if(s==="server-only")return{};
   if(s.startsWith(".")){
    const base=path.resolve(path.dirname(filename),s),resolved=[base,base+".ts",base+".mjs",base+".js",path.join(base,"index.ts")].find(f=>existsSync(f)&&!f.endsWith(path.sep));
    if(resolved?.endsWith(".ts"))return compile(resolved);
    if(resolved)return local(resolved);
   }
   return local(s);
  };
  m._compile(ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return m.exports;
 }
 const exported=compile(file);
 try{return await fn(exported,calls);}
 finally{for(const k of["window","document","fetch"])if(prior[k]===undefined)delete globalThis[k];else globalThis[k]=prior[k];for(const[k,v]of [["NEXT_PUBLIC_SUPABASE_URL",prior.processURL],["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",prior.processKey]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
export async function assertBrowserTransportContract(){
 await withBrowserTransport(async(api,calls)=>{
  const draft={petProfileId:pet,category:"general",title:"Synthetic",note:"Synthetic transport",severity:null,occurredAt:"2026-01-01T12:30"};
  const {prepareCareEntryInputForTransport}=await import("../../app/lib/care-log.mjs");
  const expected=prepareCareEntryInputForTransport(draft);const revision="2026-01-02T12:00:00.000Z";
  await api.createCareEntry(draft);await api.createCareEntryUnlessDuplicate(draft);await api.updateCareEntry(entry,draft,{},revision);
  assert.equal(calls.length,3);const bodies=calls.map(c=>JSON.parse(c.options.body));
  assert.deepEqual(bodies[0],{input:expected});assert.deepEqual(bodies[1],{dedupe:true,input:expected});assert.deepEqual(bodies[2],{input:expected,expectedUpdatedAt:revision});
  assert.equal(calls[2].options.method,"PATCH");assert.equal(calls[2].url,"/api/care-entries/"+entry);assert.ok(new Headers(calls[2].options.headers).get("Idempotency-Key"));
  await assert.rejects(api.updateCareEntry(entry,draft),/Reopen/);assert.equal(calls.length,3);
 });
}
