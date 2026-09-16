import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAskTask, taskMutationParameters, executeAskTask, attachTaskReceipts, resolvePendingTaskSubject, restorePendingTaskTurns, wholeAskTaskQuestion } from '../app/lib/intelligence/ask-task-continuation.ts';
const source={id:'source',role:'user',text:'so i gave him medicine yesterday',createdAt:'2026-09-15T01:00:00Z'};
const context={currentMessage:'keep that as a note',conversationTurns:[source],owner:{userId:'owner'},eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'},{id:'alien',name:'Other',user_id:'someone'}]};
const proposal={intent:'save',sourceTurnId:'source',petName:'Sable'};
test('answer obligations need an exact current-user request, not a clarification flag',()=>{
 const currentTurn={...source,id:'current',text:'Save that and compare with his older notes.'};
 const input={...context,currentTurn,currentMessage:currentTurn.text};
 assert.equal(validateAskTask({...proposal,answerRequest:null},{...input,requiresAnswer:true}).requiresAnswer,false);
 assert.equal(validateAskTask({...proposal,answerRequest:{turnId:'current',quote:'compare with his older notes'}},input).requiresAnswer,true);
 for(const answerRequest of [{turnId:'assistant',quote:'compare with his older notes'}, {turnId:'current',quote:'Invented question'}, {turnId:'source',quote:source.text}]) {
  assert.throws(()=>validateAskTask({...proposal,answerRequest},input),/ASK_REQUEST_INVALID:task/);
 }
});
for(const message of ['keep that as a note','save it, please','please put that in his care record','could you record what I just told you','guárdalo en sus notas','記録に残して']) {
 test(`validated semantic note intent has no wording-dependent execution: ${message}`,()=>{
  const task=validateAskTask(proposal,{...context,currentMessage:message});
  assert.equal(task.source.text,source.text);assert.equal(task.petId,'pet');
  const p=taskMutationParameters(task,{userId:'owner',conversationId:'conversation',currentMessageId:'authorization',timeZone:'America/Los_Angeles'});
  assert.equal(p.p_source_id,'source');assert.equal(p.p_message_id,'authorization');
  assert.equal(p.p_occurred_at,'2026-09-13T07:00:00.000Z','yesterday is relative to source-local September 14, not save time');
 });
}
test('an assistant draft and another owner pet cannot supply source or target authority',()=>{
 assert.throws(()=>validateAskTask({...proposal,sourceTurnId:'assistant'},{...context,conversationTurns:[source,{...source,id:'assistant',role:'furvise',text:'Sable received 5 mg.'}]}));
 assert.throws(()=>validateAskTask({...proposal,petName:'Other'},context));
 assert.throws(()=>validateAskTask({...proposal,sourceTurnId:'missing'},context));
});
test('cancelled or absent task cannot resume; current refusal cannot authorize a save',()=>{
 assert.throws(()=>validateAskTask({...proposal,intent:'resume'},context));
 assert.throws(()=>validateAskTask(proposal,{...context,currentMessage:"Don't save anything."}));
});
test('durable pending source survives dialogue truncation and retains revision',()=>{
 const pendingTask={id:'task',revision:4,kind:'owner_note',status:'awaiting_subject',source,authorizationMessageId:'authorization'};
 const task=validateAskTask({intent:'resume',sourceTurnId:null,petName:'Sable'},{...context,conversationTurns:[],currentMessage:'Sable',pendingTask});
 assert.equal(task.source.id,'source');assert.equal(task.revision,4);assert.equal(task.taskId,'task');
 assert.equal(validateAskTask(null,{...context,pendingTask}),null,'unrelated turn does not execute the pending task');
 assert.throws(()=>validateAskTask({intent:'resume',sourceTurnId:'changed',petName:'Sable'},{...context,pendingTask}));
});
test('source date without a known occurrence is not invented',()=>{
 const task=validateAskTask(proposal,{...context,conversationTurns:[{...source,text:'Gave medicine.'}]});
 assert.equal(taskMutationParameters(task,{userId:'owner',conversationId:'conversation',currentMessageId:'authorization'}).p_occurred_at,null);
});
test('duplicate pet names require clarification instead of selecting the first match',()=>{
 assert.throws(()=>validateAskTask(proposal,{...context,eligiblePets:[...context.eligiblePets,{id:'second',name:'Sable',user_id:'owner'}]}));
 assert.equal(validateAskTask({...proposal,petName:null},context).petId,null);
});

test('lost task acknowledgment replays unchanged parameters exactly once',async()=>{
 const parameters=taskMutationParameters(validateAskTask(proposal,context),{userId:'owner',conversationId:'conversation',currentMessageId:'authorization'});
 const calls=[];
 const result=await executeAskTask(parameters,async(name,args)=>{
  calls.push({name,args});if(calls.length===1)throw Error('response lost after commit');
  return {data:{id:'task',revision:1,status:'completed',entryId:'entry',petId:'pet'},error:null};
 });
 assert.equal(result.entryId,'entry');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
});
for(const code of ['42501','22023','40001']) test(`task ${code} is never retried with weaker authority`,async()=>{
 let calls=0;
 await assert.rejects(executeAskTask({},async()=>{calls++;return {data:null,error:{code}};}));assert.equal(calls,1);
});
test('database task receipts attach to the save request and retain pet scope',()=>{
 const turns=[{...source,id:'authorization',text:'keep that as a note'}];
 const receipts=[{messageId:'authorization',petId:'pet',record:{id:'entry',note:source.text,occurredAt:source.createdAt}}];
 assert.equal(attachTaskReceipts(turns,receipts,'pet')[0].operationReceipt.records[0].note,source.text);
 assert.equal(attachTaskReceipts(turns,receipts,'other')[0].operationReceipt,undefined);
});

test('pending subject completion is a provider-independent owned-entity lookup',()=>{
 const pendingTask={id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',source,authorizationMessageId:'permission'};
 assert.equal(resolvePendingTaskSubject({...context,pendingTask,currentMessage:'sable'}).petId,'pet');
 for(const currentMessage of ['Sable, and compare his history','Other','not Sable'])assert.equal(resolvePendingTaskSubject({...context,pendingTask,currentMessage}),null);
 assert.equal(resolvePendingTaskSubject({...context,currentMessage:'Sable'}),null,'a name alone does not invent a pending save');
});

test('mixed pending task preserves the original request and cannot use note-only shortcut',()=>{
 const request={...source,id:'permission',text:'Save that and compare with the older history.'};
 const pendingTask={id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',source,request,requiresAnswer:true,authorizationMessageId:request.id};
 assert.equal(resolvePendingTaskSubject({...context,pendingTask,currentMessage:'Sable'}),null);
 const task=validateAskTask({intent:'resume',sourceTurnId:null,petName:'Sable',answerRequired:false},{...context,pendingTask});
 assert.equal(task.requiresAnswer,true,'a planner flag cannot erase an existing obligation');
 assert.equal(wholeAskTaskQuestion({currentMessage:'Sable',askInterpretation:{request:{task}}}),request.text+'\nFollow-up: Sable');
 assert.deepEqual(restorePendingTaskTurns([],pendingTask).map(t=>t.id),['source','permission']);
 assert.equal(restorePendingTaskTurns([source,request],pendingTask).length,2);
});
test('resuming the remaining answer retains its already-saved pet',()=>{
 const pendingTask={id:'task',revision:2,kind:'owner_note',status:'awaiting_answer',source,requiresAnswer:true,petId:'pet',entryId:'entry',authorizationMessageId:'permission'};
 const task=validateAskTask({intent:'resume',sourceTurnId:null,petName:null},{...context,pendingTask});
 assert.equal(task.petId,'pet');assert.equal(task.requiresAnswer,true);
 assert.equal(resolvePendingTaskSubject({...context,pendingTask,currentMessage:'Sable'}),null);
});

test('multi-pet current source without a user-named destination remains unresolved',()=>{
 const currentTurn={...source,id:'current',text:'One of my dogs rested in the hammock. Save it.'};
 const result=validateAskTask({intent:'save',sourceTurnId:'current',petName:'Sable',answerRequest:null},{...context,currentMessage:currentTurn.text,currentTurn,conversationTurns:[],eligiblePets:[{id:'pet',name:'Sable',user_id:'owner'},{id:'other',name:'Rowan',user_id:'owner'}]});
 assert.equal(result.petId,null);
});


test('receipt-backed pronoun continuation retains the saved subject, without trusting selection alone',()=>{
 const previous={...source,text:'Sable seemed tired and ate half her breakfast. Save this.',operationReceipt:{petId:'pet',sourceMessageId:'source',requestText:'Save this.',records:[{id:'saved',note:'Original note',occurredAt:source.createdAt}]}};
 const currentTurn={...source,id:'next',text:'Also add that she drank normally.'};
 const eligiblePets=[{id:'pet',name:'Sable',user_id:'owner',sex:'male',species:'dog'}, {id:'second',name:'Rowan',user_id:'owner',sex:'female',species:'dog'}];
 const input={...context,eligiblePets,currentTurn,currentMessage:currentTurn.text,conversationTurns:[previous]};
 const p={intent:'save',sourceTurnId:'next',petName:'Sable',answerRequest:null};
 assert.equal(validateAskTask(p,input).petId,'pet');
 assert.equal(validateAskTask(p,{...input,conversationTurns:[{...previous,operationReceipt:undefined}]}).petId,null);
 assert.equal(validateAskTask(p,{...input,conversationTurns:[previous,{...source,id:'human',text:'My sister came home.'}]}).petId,null);
 assert.equal(validateAskTask(p,{...input,currentTurn:{...currentTurn,text:'One of my dogs drank normally. Save it.'}}).petId,null);
 assert.equal(validateAskTask({...p,petName:'Rowan'},input).petId,null);
});
