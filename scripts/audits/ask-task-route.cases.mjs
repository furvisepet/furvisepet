import {readOnlySuccessRouteFixture} from "../../tests/helpers/ask-read-only-success-route.mjs";
import {selectionFixture,ordinaryTask} from "../../tests/helpers/ask-read-only-wire-fixtures.mjs";
import './helpers/lifetime-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {validateAskRequest} from '../../app/lib/intelligence/ask-request-contract.ts';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import {requestProposal} from './helpers/request-proposal.mjs';
test('actual public POST rejects an unowned pet before history or mutations and releases credit',async()=>{
 const f=readOnlySuccessRouteFixture({providerCreate:async()=>{
  const value=selectionFixture({reads:[{name:"read_pet_profile",arguments:{pet:"p99"}}],task:{...ordinaryTask(true),pets:["p99"]}});
  return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:20}};
 }});
 try{
  const response=await f.send("Read another person's pet profile.");
  assert.equal(response.status,503);assert.equal(f.state.calls,1);assert.equal(f.state.reads,0);
  assert.equal(f.state.persistedAnswer,null);assert.equal(f.state.credit.status,"released");assert.equal(f.state.leaseReleased,1);
  assert.ok(f.state.tables.every(t=>t==="dog_profiles"));
 }finally{await f.release();}
});
for(const scenario of ["save","resume","cancel","cancel_saved","failure"])test("legacy "+scenario+" cannot execute an unconfirmed task or fetch facts",async()=>{
 const f=readOnlySuccessRouteFixture();
 try{
  const response=await f.send(scenario.startsWith("cancel")?"Cancel the pending note.":"Keep that as a note.");
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.dataChanged,false);assert.equal(body.turn.actionCount,0);
  assert.equal(f.state.reads,0);assert.equal(f.state.credit.status,"released");assert.equal(f.state.calls,2);
  assert.deepEqual(body.response.applicationActions,[]);assert.ok(f.state.tables.every(t=>t==="dog_profiles"));
 }finally{await f.release();}
});

test('whole-request validation rejects a resumed mixed task recast as only saving',()=>{
 const source={id:'source',role:'user',text:'rested in the hammock',createdAt:'2026-09-15T12:00:00Z'};
 const request={...source,id:'authorization',text:'Save that and compare with the older notes.'};
 const context={owner:{userId:'owner'},pet:{id:'pet',name:'Sable',user_id:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'}],currentMessage:'Sable',conversationTurns:[source,request],pendingTask:{id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',requiresAnswer:true,source,request,authorizationMessageId:request.id}};
 const proposal=requestProposal({operation:'update',subject:'selected',petNames:[],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:null,task:{intent:'resume',sourceTurnId:'source',petName:'Sable',answerRequired:false}},'Sable');
 assert.throws(()=>validateAskRequest(proposal,context),/ASK_REQUEST_INVALID:task/);
 proposal.mode='mixed';proposal.referenceTurnIds=['authorization'];proposal.question=request.text;
 assert.equal(validateAskRequest(proposal,context).request.task.requiresAnswer,true);
});

test('source-bound cancellation rejects an unmatched advisory conversation source',()=>{
 const source={id:'source',role:'user',text:'Sable rested in the hammock.',createdAt:'2026-09-15T12:00:00Z'};
 const request={...source,id:'request',text:'save that as a note'};
 const context={owner:{userId:'owner'},pet:{id:'pet',name:'Sable',user_id:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'}],currentMessage:"Don't keep it.",conversationTurns:[source,request],pendingTask:{id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',requiresAnswer:false,source,request,authorizationMessageId:'request'}};
 const proposal=requestProposal({operation:'general',subject:'selected',petNames:['Sable'],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'general',task:{intent:'cancel',sourceTurnId:'source',petName:null,answerRequest:null}},context.currentMessage);
 proposal.mode='conversation';proposal.referenceTurnIds=['invalid-advisory-reference'];
 assert.throws(()=>validateAskRequest(proposal,context),/ASK_REQUEST_INVALID:conversation_source/);
});

test('an ungrounded save-decline conversation cannot borrow historical source authority',()=>{
 const source={id:'source',role:'user',text:'Sable rested in the hammock.',createdAt:'2026-09-15T12:00:00Z'};
 const context={owner:{userId:'owner'},pet:{id:'pet',name:'Sable',user_id:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'}],currentMessage:'Please do not save that.',conversationTurns:[source]};
 const proposal=requestProposal({operation:'general',subject:'selected',petNames:['Sable'],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'general'},context.currentMessage);
 proposal.mode='conversation';
 context.currentTurn={id:'current',role:'user',text:context.currentMessage,createdAt:'2026-09-16T12:00:00Z'};
 assert.throws(()=>validateAskRequest(proposal,context),/ASK_REQUEST_INVALID:conversation_source/);
});
