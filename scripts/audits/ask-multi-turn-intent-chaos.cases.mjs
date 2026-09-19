import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAskTask, resolvePendingTaskSubject } from '../../app/lib/intelligence/ask-task-continuation.ts';
import { resolveDeterministicTurnSubject, explicitMutationTarget } from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
import { resolveWorkingMemoryFollowup } from '../../app/lib/furvise-brain/working-memory.ts';

const pets=[
  {id:'milo',name:'Milo',user_id:'owner',species:'dog',sex:'male'},
  {id:'luna',name:'Luna',user_id:'owner',species:'cat',sex:'female'},
  {id:'pepper',name:'Pepper',user_id:'owner',species:'dog',sex:'female'},
];
const source={id:'u1',role:'user',text:'He had soft stool after breakfast.',createdAt:'2026-09-17T10:00:00Z'};
const saveRequest={id:'u2',role:'user',text:'save that',createdAt:'2026-09-17T10:01:00Z'};
const base={owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],conversationTurns:[source],currentMessage:'save that'};

test('save-that without established subject remains pending instead of guessing selected pet',()=>{
  const task=validateAskTask({intent:'save',sourceTurnId:'u1',petName:null,answerRequest:null},base);
  assert.equal(task.petId,null);
});

test('verified save then explicit cancellation cannot be resurrected by a later pet name',()=>{
  const pending={id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',source,request:saveRequest,authorizationMessageId:'u2'};
  const cancelled={...pending,status:'cancelled'};
  assert.equal(resolvePendingTaskSubject({...base,pendingTask:cancelled,currentMessage:'Milo'}),null);
});

test('subject correction switches later pronouns but does not create save authority',()=>{
  const turns=[{role:'user',text:'Milo had soft stool.'},{role:'user',text:'nah Luna not Milo'}];
  const corrected=resolveDeterministicTurnSubject({message:'nah Luna not Milo',pets,recentConversation:turns.slice(0,1),selectedPetId:'milo'});
  assert.equal(corrected?.petId,'luna');
  const follow=resolveDeterministicTurnSubject({message:'what about her now?',pets,recentConversation:turns,selectedPetId:'milo'});
  assert.equal(follow?.petId,'luna');
  assert.equal(explicitMutationTarget('nah Luna not Milo',pets),null);
});

test('switching to Pepper then saying change that one does not become a write without an explicit action target',()=>{
  const turns=[{role:'user',text:'Luna had a litter issue.'},{role:'user',text:'Pepper had itching instead.'}];
  const focus=resolveDeterministicTurnSubject({message:'Pepper had itching instead.',pets,recentConversation:turns.slice(0,1),selectedPetId:'milo'});
  assert.equal(focus?.petId,'pepper');
  assert.equal(explicitMutationTarget('change that one',pets),null);
});

test('fresh historical read after save/cancel language is not collapsed into working-memory continuation',()=>{
  const turns=[source,saveRequest,{id:'u3',role:'user',text:"actually don't save it"},{id:'u4',role:'user',text:'Luna not Milo'}];
  assert.equal(resolveWorkingMemoryFollowup('compare her old weight history',turns),null);
});

test('a later explicit save targets only the newly named pet and cannot inherit the earlier cancelled target',()=>{
  assert.equal(explicitMutationTarget('ok save this for pepper only pls not milo',pets),'pepper');
  assert.equal(explicitMutationTarget('save this for pepper and luna',pets),null);
});
