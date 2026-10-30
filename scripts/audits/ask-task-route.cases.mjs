import {publicV1AskCapability,PUBLIC_V1_ASK_MUTATION_LIMITATION,PUBLIC_V1_CAPABILITIES} from '../../app/lib/public-v1-capabilities.ts';
import './helpers/lifetime-harness.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {capturePreviewEvidence,flushPreviewEvidence} from '../../app/lib/intelligence/ask-preview-capture.mjs';
import {validateAskRequest} from '../../app/lib/intelligence/ask-request-contract.ts';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import {requestProposal} from './helpers/request-proposal.mjs';
import {exceedsSelectedPetRead} from '../../app/lib/intelligence/selected-pet-read.ts';
import {explicitlyNamedOwnedPets} from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
const route=readFileSync(new URL('../../app/api/ask/route.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('route.ts',route,ts.ScriptTarget.Latest,true);
let callback;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='aiAdmission.run')callback=n.arguments[0];ts.forEachChild(n,visit);}visit(ast);
assert.ok(callback);
const code=ts.transpileModule('const run = '+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nrun';
test('actual admitted route refuses another pet before history or mutations and releases its credit',async()=>{
 const calls=[];
 const lifecycle={transition(){return this;},credit(){return this;},settlement(){return this;},route(){return this;}};
 const sandbox={sourceWindowDisclosure:null,capturePreviewEvidence,flushPreviewEvidence,publicV1AskCapability,liveContext:{pet:{id:'selected',name:'Sable'},conversationTurns:[]},preparedRequest:{userMessageId:'current'},
  requestId:'request',logicalTurnId:'request',userId:'owner',petId:'selected',question:'Compare both pets.',
  model:'test',onProviderEvent:()=>{},usage:{allowed:true},creditRequestId:'attempt',aiCreditPayloadHash:'hash',retryReuse:false,
  turnLifecycle:lifecycle,creditReserved:false,creditFinalState:'not_reserved',generationStage:'',
  turnAuthoritativePetIds:['selected'],contextUsed:{},ownerNotePersistence:null,execution:{},immediateEmergency:null,
  reserveAiCredit:async()=>{calls.push('reserve');return{status:'reserved'};},logAskStage:()=>{},
  interpretAskQuestion:async()=>({petIds:['other'],request:{evidenceBasis:'saved_history'}}),exceedsSelectedPetRead,explicitlyNamedOwnedPets,ambiguousBackwardMultiPetReference:()=>null,
  safeReleaseAiCredit:async()=>{calls.push('release');return true;},
  buildSubjectClarificationOrchestration:()=>({answer:{},clarificationQuestion:'Which pet?'}),
 };
 const response=await vm.runInNewContext(code,sandbox)();
 assert.deepEqual(calls,['reserve','release']);
 assert.match(response.answer.summary,/only Sable's records/);
 assert.equal(sandbox.creditFinalState,'released');
 assert.equal(sandbox.turnAuthoritativePetIds.length,0);
 assert.equal(sandbox.contextUsed.usedSources.length,0);
});
for(const scenario of ['save','resume','cancel','cancel_saved','failure'])test(`legacy ${scenario} cannot execute an unconfirmed task or fetch facts`,async()=>{
 const cancelling=scenario.startsWith('cancel');
 const calls=[];const source={id:'source',role:'user',text:'gave medicine yesterday',createdAt:'2026-09-15T12:00:00Z'};
 const priorSave={...source,id:'prior-save',text:'save that as a note'};
 const pending=scenario==='resume'||cancelling?{id:'pending',revision:1,kind:'owner_note',status:'awaiting_subject',source,request:priorSave,authorizationMessageId:'prior-save'}:null;
 const message=scenario==='resume'?'Sable':cancelling?'cancel the note':'keep that as a note';
 const pet={id:'pet',name:'Sable',user_id:'owner'};
 const liveContext={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:message,currentTurn:{...source,id:'current',text:message},conversationTurns:pending?[source,priorSave]:[source],pendingTask:pending,timeZone:'UTC'};
 const proposal=requestProposal({operation:cancelling?'general':'update',subject:cancelling?'non_pet':'selected',petNames:[],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:cancelling?'general':null,task:{intent:scenario==='failure'?'save':cancelling?'cancel':scenario,sourceTurnId:'source',petName:cancelling?null:'Sable'}},message);
 const lifecycle={transition(){return this;},credit(){return this;},settlement(){return this;},route(){return this;},snapshot(){return {};}};
 const sandbox={sourceWindowDisclosure:null,capturePreviewEvidence,flushPreviewEvidence,publicV1AskCapability,liveContext,preparedRequest:{conversationId:'conversation',userMessageId:'current'},requestId:'request',logicalTurnId:'request',userId:'owner',petId:'pet',question:message,
  request:{},model:'test',onProviderEvent:()=>{},usage:{allowed:true},creditRequestId:'attempt',aiCreditPayloadHash:'hash',retryReuse:false,
  turnAuthoritativePetIds:['pet'],contextUsed:{},turnLifecycle:lifecycle,creditReserved:false,creditFinalState:'not_reserved',generationStage:'',ownerNotePersistence:null,ownerNoteSourceMessageId:'current',ownerNotePetId:'pet',completedContinuation:null,execution:{},immediateEmergency:null,
  reserveAiCredit:async()=>{calls.push('reserve');return{status:'reserved'};},logAskStage:()=>{},
  interpretAskQuestion:async({context})=>validateAskRequest(proposal,context),exceedsSelectedPetRead,explicitlyNamedOwnedPets,ambiguousBackwardMultiPetReference:()=>null,
  safeReleaseAiCredit:async()=>{calls.push('release');return true;},
  buildSubjectClarificationOrchestration:()=>({answer:{},clarificationQuestion:'Which pet?'}),
 };
 const run=vm.runInNewContext(code,sandbox);
 const response=await run();assert.deepEqual(calls,['reserve','release']);
 assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);assert.equal(response.clarificationQuestion,'');
 assert.equal(response.answer.summary,PUBLIC_V1_ASK_MUTATION_LIMITATION);
 assert.equal(sandbox.creditFinalState,'released');assert.deepEqual(Array.from(sandbox.turnAuthoritativePetIds),[]);assert.deepEqual(Array.from(sandbox.contextUsed.usedSources),[]);assert.equal(sandbox.completedContinuation,null);
 assert.equal(sandbox.execution.savedNoteResponse,undefined);

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

test('source-bound cancellation ignores unrelated advisory read scope',()=>{
 const source={id:'source',role:'user',text:'Sable rested in the hammock.',createdAt:'2026-09-15T12:00:00Z'};
 const request={...source,id:'request',text:'save that as a note'};
 const context={owner:{userId:'owner'},pet:{id:'pet',name:'Sable',user_id:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'}],currentMessage:"Don't keep it.",conversationTurns:[source,request],pendingTask:{id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',requiresAnswer:false,source,request,authorizationMessageId:'request'}};
 const proposal=requestProposal({operation:'general',subject:'selected',petNames:['Sable'],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'general',task:{intent:'cancel',sourceTurnId:'source',petName:null,answerRequest:null}},context.currentMessage);
 proposal.mode='conversation';proposal.referenceTurnIds=['invalid-advisory-reference'];
 const result=validateAskRequest(proposal,context);
 assert.equal(result.request.task.intent,'cancel');assert.deepEqual(result.petIds,[]);assert.equal(result.history,null);
});

test('declining a save cannot be reanchored into a pet-history conversation',()=>{
 const source={id:'source',role:'user',text:'Sable rested in the hammock.',createdAt:'2026-09-15T12:00:00Z'};
 const context={owner:{userId:'owner'},pet:{id:'pet',name:'Sable',user_id:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'}],currentMessage:'Please do not save that.',conversationTurns:[source]};
 const proposal=requestProposal({operation:'general',subject:'selected',petNames:['Sable'],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,evidenceBasis:'general'},context.currentMessage);
 proposal.mode='conversation';
 const result=validateAskRequest(proposal,context);
 assert.equal(result.request.task,null);assert.deepEqual(result.petIds,[]);assert.equal(result.history,null);assert.equal(result.readOnly,true);
});
