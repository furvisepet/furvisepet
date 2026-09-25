import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fixture,id} from './helpers/canonical-replace.mjs';
registerHooks({resolve(s,c,next){
 if(s.endsWith('/care-authority-client.ts'))return {shortCircuit:true,url:'data:text/javascript,export const createCanonicalCareAuthorityClient=()=>globalThis.__replaceCatalog;'};
 return next(s,c);
}});
const {loadReplaceReferences}=await import('../app/lib/intelligence/replace-reference-context.ts');
const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
test('catalog converts only owned supplied rows to opaque handles',async()=>{
 const calls=[],row={id:id(4),user_id:id(1),pet_profile_id:id(2),note:'Original record.',created_at:'2026-09-20T00:00:00Z',
 updated_at:'2026-09-20T00:00:00Z',occurred_at:'2026-09-20T00:00:00Z'};
 globalThis.__replaceCatalog={rpc:async(name,args)=>{calls.push({name,args});return {data:[row,{...row,user_id:id(9)},{...row,pet_profile_id:id(9)}],error:null};}};
 const refs=await loadReplaceReferences(id(1),[id(2)],'2026-09-23T00:00:00Z');
 assert.equal(refs.length,1);assert.equal(refs[0].recordId,row.id);assert.notEqual(refs[0].ref,row.id);
 assert.equal(calls[0].name,'list_ask_replace_targets');assert.deepEqual(calls[0].args.p_pet_ids,[id(2)]);
});
test('unavailable catalog supplies no guessed exact handles',async()=>{
 globalThis.__replaceCatalog={rpc:async()=>({data:null,error:{message:'Unavailable'}})};
 assert.deepEqual(await loadReplaceReferences(id(1),[id(2)],'2026-09-23T00:00:00Z'),[]);
});
test('one Brain proposal selects a supplied opaque handle and Binder owns record identity',async()=>{
 const f=fixture(),ref={ref:'opaque-given',recordId:id(4),ownerId:id(1),petId:f.pet.id,
 body:'Supplied original.',eventAt:'2026-09-22T00:00:00Z',createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-22T00:00:00Z'};
 f.context.replaceReferences=[ref];f.proposal.target={kind:'exact_record',ref:ref.ref};
 let calls=0;
 const result=await interpretAskQuestion({context:f.context,model:'offline',client:{responses:{create:async request=>{
 calls++;const wire=JSON.stringify(request);
 assert.ok(wire.includes('opaque-given'));assert.ok(!wire.includes(ref.recordId));
 return {output_text:JSON.stringify(f.request),usage:{input_tokens:0,output_tokens:0}};
 }}}});
 assert.equal(calls,1);assert.equal(result.request.writeJob.target.recordId,id(4));
 assert.equal(result.request.writeJob.target.updatedAt,ref.updatedAt);
});
