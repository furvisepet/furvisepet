import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAskInterpretationRequest} from '../app/lib/intelligence/interpret-ask.ts';
import {inspectAskWireContract} from './helpers/ask-wire-contract.mjs';
const pet={id:'synthetic-pet',user_id:'synthetic-owner',name:'Synthetic Subject',species:'dog'};
const text='What name is saved for Synthetic Subject?';
const context={owner:{userId:pet.user_id},pet,eligiblePets:[pet],timeZone:'UTC',currentMessage:text,
 currentTurn:{id:'synthetic-current',role:'user',text},conversationTurns:[]};
const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
test('native contract inspection binds exact schema, guidance and server-derived source context',async()=>{
 const seen=await inspectAskWireContract(prepared.request,context);
 assert.equal(JSON.stringify(seen.transport.schema),JSON.stringify(prepared.request.text.format.schema));
 for(const [label,change] of [
  ['schema',r=>{r.text.format.schema.description='changed';}],
  ['guidance',r=>{r.instructions+=' changed';}],
  ['source',r=>{const i=JSON.parse(r.input);i.userSources.at(-1).text='changed';r.input=JSON.stringify(i);}],
  ['selected pet',r=>{const i=JSON.parse(r.input);i.selectedPet='Other';r.input=JSON.stringify(i);}],
  ['timezone',r=>{const i=JSON.parse(r.input);i.timeZone='Pacific/Auckland';r.input=JSON.stringify(i);}],
  ['owned list',r=>{const i=JSON.parse(r.input);i.ownedPets=[];r.input=JSON.stringify(i);}],
 ]){
  const altered=JSON.parse(JSON.stringify(prepared.request));change(altered);
  await assert.rejects(inspectAskWireContract(altered,context),undefined,label);
 }
 // Same labels cannot reuse an authenticated owner's source context.
 await assert.rejects(inspectAskWireContract(prepared.request,{...context,owner:{userId:'different-owner'}}));
 assert.equal(JSON.stringify((await inspectAskWireContract(prepared.request,context)).transport.schema),JSON.stringify(seen.transport.schema));
});
