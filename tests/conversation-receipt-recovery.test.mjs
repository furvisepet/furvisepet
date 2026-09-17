import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverConversationReceiptReferences, requestsStoredNoteReadback } from '../app/lib/intelligence/conversation-receipt-recovery.ts';

const input={userId:'owner',petId:'pet',conversationId:'conversation',historyAccess:{months:3,from:'2026-06-16',to:'2026-09-17'}};
const source={id:'old-source',request_id:'request',role:'user',user_text:'An original owner observation.',created_at:'2026-09-15T15:00:00Z',user_id:'owner',conversation_id:'conversation'};
const row={id:'note',user_id:'owner',pet_profile_id:'pet',source_message:source};
function database(data,error=null){
 const calls=[];
 const query={then(resolve,reject){return Promise.resolve({data,error}).then(resolve,reject);}};
 for(const method of ['from','select','eq','is','gte','lt','order','limit','abortSignal'])query[method]=(...args)=>{calls.push([method,...args]);return query;};
 return {query,calls};
}
test('receipt discovery is bounded and scoped to owner, pet, conversation and history access',async()=>{
 const {query,calls}=database([row,row]);
 const result=await recoverConversationReceiptReferences(query,input);
 assert.equal(result.length,1);
 assert.equal(result[0].recoveredReceiptReference,true);
 assert.equal(result[0].response_data,null);
 assert.equal(result[0].user_text,source.user_text);
 for(const call of [['eq','user_id','owner'],['eq','pet_profile_id','pet'],['is','deleted_at',null],['eq','source_message.user_id','owner'],['eq','source_message.conversation_id','conversation'],['eq','source_message.role','user'],['gte','occurred_at',input.historyAccess.from],['limit',4]])assert.ok(calls.some(actual=>JSON.stringify(actual)===JSON.stringify(call)),JSON.stringify(call));
 assert.equal(calls.some(call=>call[0]==='lt'&&call[1]==='occurred_at'),false,'receipt lineage keeps the subscription lower bound but does not hide future-dated saved records');
 assert.ok(calls.find(c=>c[0]==='abortSignal')[1] instanceof AbortSignal);
 assert.match(calls.find(c=>c[0]==='select')[1],/!intelligence_source_message_id!inner/);
});
test('returned references cannot cross ownership, pet or conversation boundaries',async()=>{
 const invalid=[{...row,user_id:'alien'},{...row,pet_profile_id:'other'},...[{user_id:'alien'},{conversation_id:'other'},{role:'furvise'},{user_text:''},{user_text:'a'.repeat(1201)},{created_at:'invalid'}].map(change=>({...row,source_message:{...source,...change}})),{...row,source_message:null}];
 const {query}=database([...invalid,row]);
 assert.deepEqual((await recoverConversationReceiptReferences(query,input)).map(r=>r.id),['old-source']);
});
test('receipt discovery errors and absent records never prove persistence',async()=>{
 await assert.rejects(recoverConversationReceiptReferences(database(null,{code:'failure'}).query,input),/receipt_reference_unavailable/);
 assert.deepEqual(await recoverConversationReceiptReferences(database([]).query,input),[]);
});
test('readback hint is general and does not trigger for ordinary new saves',()=>{
 assert.equal(requestsStoredNoteReadback('Did the note save correctly? Show exactly what was stored.'),true);
 assert.equal(requestsStoredNoteReadback('Quote the recorded notes.'),true);
 assert.equal(requestsStoredNoteReadback('Save this observation.'),false);
});
