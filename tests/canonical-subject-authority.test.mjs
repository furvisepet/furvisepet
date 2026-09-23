import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {readInterpretationSubject} from '../app/lib/intelligence/interpret-ask.ts';
import {bindTypedReadTicket} from '../app/lib/furvise-brain/typed-read-ticket.ts';
const ownership={ownerId:'owner',pets:[{id:'bound',user_id:'owner'},{id:'other',user_id:'owner'}]};
const base={version:'ask-interpretation.v1',operation:'recall',petIds:['other'],readPetIds:['other'],readOnly:true,clarification:null};
const ticket=bindTypedReadTicket({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[],
 selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:2,per:'group'}}]},
 outputs:{completeness:'sufficient',ordering:'desc',limit:null}},['bound']);
for(const [name,request] of [
 ['read',{readTicket:ticket}],['append',{appendJob:{petId:'bound'}}],['replace',{writeJob:{petId:'bound'}}],
 ['profile field',{fieldMutationJob:{domain:'pet_profile',petId:'bound'}}],
 ['concern transition',{stateTransitionJob:{petId:'bound'}}],
 ['lifecycle',{lifecyclePlan:{subjects:[{petId:'bound'}]}}],
])test('canonical '+name+' subjects cannot be overridden by envelope/dialogue/UI metadata',()=>{
 const interpretation={...base,request,get currentMessage(){throw Error('RAW_TEXT_IS_NOT_AUTHORITY');},
  get conversation(){throw Error('DIALOGUE_IS_NOT_AUTHORITY');}};
 const before=structuredClone(request);
 const result=readInterpretationSubject(interpretation,'other',ownership);
 assert.deepEqual(result.resolution.petIds,['bound']);assert.equal(result.resolution.petId,'bound');
 assert.deepEqual(request,before);
 assert.throws(()=>readInterpretationSubject(interpretation,'other',{...ownership,pets:[ownership.pets[1]]}),/NOT_OWNED/);
});
test('canonical multi-subject selection stays grouped and empty scope cannot borrow the UI pet',()=>{
 const request={readTicket:{...ticket,subjects:{petIds:['bound','other']}}};
 assert.deepEqual(readInterpretationSubject({...base,request},'other',ownership).resolution.petIds,['bound','other']);
 const empty=readInterpretationSubject({...base,petIds:[],readPetIds:[],request:undefined},'other',ownership);
 assert.equal(empty.resolution.petId,null);assert.deepEqual(empty.resolution.petIds,[]);
});
test('owner singleton field semantics never gain a pet from the conversation container',()=>{
 const result=readInterpretationSubject({...base,request:{fieldMutationJob:{domain:'owner_preference',ownerId:'owner'}}},'other',ownership);
 assert.deepEqual(result.resolution.petIds,[]);assert.equal(result.resolution.petId,null);
});
test('route has no post-Brain English subject resolver and canonical append exits before legacy generation',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),route=read('app/api/ask/route.ts');
 assert.doesNotMatch(route,/resolveAskTurnSubject|resolveDeterministicTurnSubject|extractTurnSubjectFrame/);
 assert.ok(route.indexOf('prepareAppendTurn(')<route.indexOf('readInterpretationSubject(interpretation'));
 assert.match(read('app/lib/intelligence/run-intelligence.ts'),/request\?\.appendJob\) throw Error\("APPEND_REQUIRES_CONFIRMATION_CAPABILITY"\)/);
 assert.doesNotMatch(read('app/lib/application-actions/planner.ts'),/hasDeterministicUserMutationIntent|exactCareHistoryAddCommand|exactLatestHistoryEditCommand/);
});
