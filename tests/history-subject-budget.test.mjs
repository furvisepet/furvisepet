import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
import assert from 'node:assert/strict';
import test from 'node:test';
const {createEffectiveWindowResolver,HISTORY_BUDGET}=await import('../app/lib/intelligence/history-retrieval.ts');
for(const count of [1,3,5,10])test('independent correction closure is available for each of '+count+' authorized subjects',async()=>{
 const pets=Array.from({length:count},(_,i)=>'subject-'+i),calls=[];
 const coverage={queryCount:0};
 const db={rpc(name,args){assert.equal(name,'read_ask_history_correction_page');calls.push(args);return {abortSignal:async()=>({error:null,data:{claims:[],relations:[],lineage:[],sources:[],withheld_claim_ids:[],withheld_source_ids:[],truncated:false}})};}};
 const resolve=createEffectiveWindowResolver({owned:new Set(pets),petIds:pets,userId:'owner',db,coverage,deadline:Date.now()+60000});
 for(let pass=0;pass<2;pass++)for(const petId of pets){
  const result=await resolve({petId,rows:[],from:'2001-01-01T00:00:00Z',to:'2040-01-01T00:00:00Z'});
  assert.equal(result.lineageClosed,true,petId+' pass '+pass);assert.equal(result.replacementSeedsExhausted,true);
 }
 assert.equal(calls.length,count*2);assert.ok(calls.length<=count*HISTORY_BUDGET.graphCalls);
 await assert.rejects(resolve({petId:'foreign',rows:[],from:'2001-01-01T00:00:00Z',to:'2040-01-01T00:00:00Z'}),/subject_not_authorized/);
});

test('subject allowance remains finite and partial closure never becomes authority',async()=>{
 const pets=['alpha','beta'];let calls=0;
 const db={rpc(_name,args){calls++;return{abortSignal:async()=>({error:null,data:{claims:[],relations:[],lineage:[],sources:[],truncated:args.p_seed_pet_ids.includes('beta')}})};}};
 const resolve=createEffectiveWindowResolver({owned:new Set(pets),petIds:pets,userId:'owner',db,coverage:{queryCount:0},deadline:Date.now()+60000});
 const read=petId=>resolve({petId,rows:[],from:'2001-01-01T00:00:00Z',to:'2040-01-01T00:00:00Z'});
 for(let i=0;i<HISTORY_BUDGET.graphCalls;i++)assert.equal((await read('alpha')).lineageClosed,true);
 const before=calls;assert.equal((await read('alpha')).lineageClosed,false);assert.equal(calls,before,'no call after subject budget exhaustion');
 const partial=await read('beta');assert.equal(partial.lineageClosed,false);assert.equal(partial.replacementSeedsExhausted,false);assert.deepEqual(partial.records,[]);
});
