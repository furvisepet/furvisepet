import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {isFurviseOwner,FURVISE_OWNER_ID} from '../app/lib/operations/owner-access.ts';
let calls=0;
globalThis.__ownerTest={auth:{response:Response.json({}, {status:401})},db:{rpc:async(name,args)=>{calls++;return {data:{name,args},error:null};},from:()=>{calls++;return {upsert:async()=>({error:null})};}}};
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {shortCircuit:true,url:'data:text/javascript,export default {}'};
 if(specifier.endsWith('/authenticated-api-server'))return {shortCircuit:true,url:'data:text/javascript,export const getAuthenticatedApiContext=async()=>globalThis.__ownerTest.auth'};
 if(specifier.endsWith('/admin-client'))return {shortCircuit:true,url:'data:text/javascript,export const createOperationsAdminClient=()=>globalThis.__ownerTest.db'};
 if(specifier.startsWith('.')){const url=new URL(specifier,context.parentURL);if(existsSync(new URL(url.href+'.ts')))return next(url.href+'.ts',context);}
 return next(specifier,context);
}});
const {GET}=await import('../app/api/admin/dashboard/route.ts');
const {POST}=await import('../app/api/admin/exclusions/route.ts');
const req=(body)=>new Request('https://www.furvise.com/api/admin/exclusions',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
test('owner identity cannot be granted by metadata, email, or anonymous owner ID',()=>{
 assert.equal(isFurviseOwner(null),false);
 assert.equal(isFurviseOwner({id:'another-user',email:'owner@example.com',user_metadata:{role:'admin',id:FURVISE_OWNER_ID}}),false);
 assert.equal(isFurviseOwner({id:FURVISE_OWNER_ID,is_anonymous:true}),false);
 assert.equal(isFurviseOwner({id:FURVISE_OWNER_ID}),true);
});
test('both real API handlers deny signed-out and ordinary accounts before database access',async()=>{
 for(const auth of [{response:Response.json({}, {status:401})},{user:{id:'ordinary',user_metadata:{role:'admin'}},userId:'ordinary'}]){
  globalThis.__ownerTest.auth=auth;calls=0;
  for(const response of [await GET(new Request('https://www.furvise.com/api/admin/dashboard?owner=true')),await POST(req({userId:FURVISE_OWNER_ID,excluded:true}))]){
   assert.equal(response.status,'response' in auth?401:404);assert.match(response.headers.get('cache-control'),/no-store/);
  }assert.equal(calls,0);
 }
});
test('owner can fetch metrics, range is bounded, caller cannot replace owner identity',async()=>{
 globalThis.__ownerTest.auth={user:{id:FURVISE_OWNER_ID},userId:FURVISE_OWNER_ID};calls=0;
 const ok=await GET(new Request('https://www.furvise.com/api/admin/dashboard?days=30&owner=attacker'));
 assert.equal(ok.status,200);assert.match(ok.headers.get('cache-control'),/no-store/);
 assert.equal((await ok.json()).args.p_owner,FURVISE_OWNER_ID);
 assert.equal((await GET(new Request('https://www.furvise.com/api/admin/dashboard?days=10000'))).status,400);assert.equal(calls,1);
});
test('owner mutations reject oversized payloads and forged fields',async()=>{
 calls=0;
 for(const body of [{userId:FURVISE_OWNER_ID,excluded:true,role:'admin'},{userId:'a'.repeat(1000),excluded:true},{userId:'------------------------------------',excluded:true}])assert.equal((await POST(req(body))).status,400);
 assert.equal(calls,0);
 assert.equal((await POST(req({userId:FURVISE_OWNER_ID,excluded:true}))).status,200);
});
