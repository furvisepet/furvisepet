import {stagedContext,stagedReferences} from './helpers/staged-receipt-audit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptFixture,id} from './helpers/canonical-receipt.mjs';
test('receipt discovery is bounded and scoped to owner independently of factual event time',async()=>{
 const f=receiptFixture({future:true});
 for(let n=0;n<30;n++)f.tables.ask_action_capabilities.push({...f.cap,id:id(500+n)});
 const refs=await stagedReferences(f);
 assert.ok(refs.length>0&&refs.length<=12);
 for(const ref of refs)assert.equal(ref.ownerId,f.owner);
});
test('returned references cannot cross ownership and bound subject boundaries',async()=>{
 const f=receiptFixture(),ctx=await stagedContext(f),p=f.request(ctx);
 f.cap.user_id=id(99);assert.deepEqual(await stagedReferences(f),[]);
 assert.equal((await f.execute(p)).status,'unavailable');
});
test('receipt discovery errors and absent records never prove persistence',async()=>{
 const f=receiptFixture();f.tables.ask_action_capabilities=[];
 assert.deepEqual(await stagedReferences(f),[]);
 f.fail.add('ask_action_capabilities');
 await assert.rejects(()=>stagedReferences(f),/ASK_CATALOG_UNAVAILABLE/); // An unavailable catalog never proves empty history or persistence.
});
test('readback wording cannot create receipt authority or route around a typed reference',async()=>{
 for(const wording of ['Did the note save correctly? Show exactly what was stored.','Quote the recorded notes.','Save this observation.']){
  const f=receiptFixture(),ctx=await stagedContext(f);
  ctx.currentMessage=wording;const result=await f.execute(f.request(ctx));
  assert.equal(result.status,'complete');assert.equal(result.records[0].operation.status,'succeeded');
  f.tables.ask_action_capabilities=[];assert.equal((await f.execute(f.request(ctx))).status,'unavailable');
 }
});
