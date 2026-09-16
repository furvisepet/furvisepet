import './helpers/lifetime-harness.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {validateAskRequest} from '../../app/lib/intelligence/ask-request-contract.ts';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import {executeAskTask,taskMutationParameters} from '../../app/lib/intelligence/ask-task-continuation.ts';
import {requestProposal} from './helpers/request-proposal.mjs';
const route=readFileSync(new URL('../../app/api/ask/route.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('route.ts',route,ts.ScriptTarget.Latest,true);
let callback;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='aiAdmission.run')callback=n.arguments[0];ts.forEachChild(n,visit);}visit(ast);
assert.ok(callback);
const code=ts.transpileModule('const run = '+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nrun';
for(const scenario of ['save','resume','cancel','cancel_saved','failure'])test(`actual admitted route continuation ${scenario}`,async()=>{
 const cancelling=scenario.startsWith('cancel');
 const calls=[];const source={id:'source',role:'user',text:'gave medicine yesterday',createdAt:'2026-09-15T12:00:00Z'};
 const pending=scenario==='resume'||cancelling?{id:'pending',revision:1,kind:'owner_note',status:'awaiting_subject',source,authorizationMessageId:'prior-save'}:null;
 const message=scenario==='resume'?'Sable':cancelling?'cancel the note':'keep that as a note';
 const pet={id:'pet',name:'Sable',user_id:'owner'};
 const liveContext={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:message,currentTurn:{...source,id:'current',text:message},conversationTurns:[source],pendingTask:pending,timeZone:'UTC'};
 const proposal=requestProposal({operation:cancelling?'general':'update',subject:cancelling?'non_pet':'selected',petNames:[],topic:'owner note',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:cancelling?'general':null,task:{intent:scenario==='failure'?'save':cancelling?'cancel':scenario,sourceTurnId:'source',petName:cancelling?null:'Sable'}},message);
 const lifecycle={transition(){return this;},credit(){return this;},settlement(){return this;},route(){return this;},snapshot(){return {};}};
 const sandbox={liveContext,preparedRequest:{conversationId:'conversation',userMessageId:'current'},requestId:'request',logicalTurnId:'request',userId:'owner',petId:'pet',question:message,
  request:{},model:'test',onProviderEvent:()=>{},usage:{allowed:true},creditRequestId:'attempt',aiCreditPayloadHash:'hash',retryReuse:false,
  turnLifecycle:lifecycle,creditReserved:false,creditFinalState:'not_reserved',generationStage:'',ownerNotePersistence:null,ownerNoteSourceMessageId:'current',ownerNotePetId:'pet',completedContinuation:null,execution:{},immediateEmergency:null,
  reserveAiCredit:async()=>{calls.push('reserve');return{status:'reserved'};},logAskStage:()=>{},
  interpretAskQuestion:async({context})=>validateAskRequest(proposal,context),
  requireRateLimitedRequest:async()=>({release:async()=>{}}),taskMutationParameters,executeAskTask,
  taskAuthority:{rpc:async(name,args)=>{calls.push('execute');assert.equal(name,'apply_ask_task');assert.equal(args.p_source_text,source.text);assert.equal(args.p_message_id,'current');return scenario==='failure'?{data:null,error:{code:'42501'}}:{data:{id:'task',revision:1,status:cancelling?'cancelled':'completed',petId:'pet',entryId:scenario==='cancel'?null:'entry'},error:null};}},
  completeOwnerNoteResponse:async input=>input,revalidateAskStateViews:()=>{},
  safeReleaseAiCredit:async()=>{calls.push('release');return true;},
  buildSubjectClarificationOrchestration:()=>({answer:{},clarificationQuestion:'Which pet?'}),
 };
 const run=vm.runInNewContext(code,sandbox);
 if(scenario==='failure'){await assert.rejects(run(),/ASK_TASK_WRITE_UNCONFIRMED/);assert.equal(sandbox.execution.savedNoteResponse,undefined);return;}
 const response=await run();assert.deepEqual(calls,['reserve','execute','release']);
 if(cancelling){assert.match(response.answer.summary,scenario==='cancel_saved'?/still saved/:/not saved/);assert.equal(sandbox.completedContinuation,null);}
 else {const result=await sandbox.completedContinuation();assert.equal(result.receipt.careEntryIds[0],'entry');assert.equal(result.needsAnswer,false);assert.equal(sandbox.ownerNoteSourceMessageId,'source');}
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
