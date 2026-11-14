import test from 'node:test';
import assert from 'node:assert/strict';
import {runReadOnlyAsk} from '../app/lib/ask-read-only/core.mjs';
import {decodeClinicalSelection} from '../app/lib/ask-read-only/clinical-policy.mjs';
import {decodeComponentSelection} from '../app/lib/ask-read-only/task-components.mjs';
const pets=[{id:'selected-private-pet-123456789',ownerId:'owned',name:'Willow',species:'dog'},{id:'named-private-pet-123456789',ownerId:'owned',name:'Juniper',species:'cat'}];
const safety=(patch={})=>({medicationIntent:'none',referent:'clear',missingContext:[],careContext:'none',eventAssessments:[],...patch});
const task=(patch={})=>({id:'t1',kind:'saved_content',needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:'none',workflow:'none',pets:['p1'],reference:null,missing:['pet'],...patch});
async function execute({question="What pattern was on Juniper’s old travel mat? No description was saved.",plan=[task()],state=safety({referent:'essential_unknown',missingContext:['pet']}),prose='The pattern was blue squares.',petRows=pets}={}){
 let calls=0,reads=0;const contexts=[];
 const result=await runReadOnlyAsk({ownerId:'owned',selectedPetId:pets[0].id,pets:petRows,dialogue:[],question,now:'2026-11-14T00:00:00Z',timeZone:'UTC'},{
 provider:async(req,phase)=>{calls++;contexts.push(structuredClone(req.context));
  if(phase==='read_selection')return decodeComponentSelection({safety:state,reads:[],draft:'Unverified old draft.',historyIntent:{requested:false,timeBasis:'ambiguous',pet:null},workflowIntent:'none',taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
  return {components:[{kind:'general',text:prose,sources:[]}],quotes:[],sources:[],calculations:[],replyType:'partial',presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:'none',pet:null},completion:plan.map(t=>({task:t.id,status:'complete',reason:'none',componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}))};
 },read:async()=>{reads++;throw Error('UNEXPECTED_PRIVATE_READ');}});
 return {result,calls,reads,contexts};
}
test('actual two-call source-free task resolves an explicit owned pet instead of asking again',async()=>{
 const r=await execute();assert.equal(r.calls,2);assert.equal(r.reads,0);
 assert.doesNotMatch(r.result.answer.answer,/Which pet/);assert.match(r.result.answer.answer,/verified saved information/);
 assert.deepEqual(r.contexts[1].taskPlan[0].pets,['p2']);assert.deepEqual(r.contexts[1].taskPlan[0].missing,[]);
 assert.deepEqual(r.result.sources,[]);
});
test('source-free saved-content task cannot publish an invented private fact',async()=>{
 const r=await execute({plan:[task({pets:['p2'],missing:[]})],state:safety()});
 assert.doesNotMatch(r.result.answer.answer,/blue squares/);assert.match(r.result.answer.answer,/verified saved information/);
 assert.equal(r.result.answer.taskCompletion[0].status,'unresolved');assert.equal(r.result.answer.taskCompletion[0].reason,'source_unavailable');
});
test('real unresolved pet/year history remains a clarification with zero reads',async()=>{
 const r=await execute({question:'What did she weigh in May?',plan:[task({needsHistory:true,recordMode:'single',pets:[],missing:['pet','year']})],state:safety({referent:'essential_unknown',missingContext:['pet','date']})});
 assert.match(r.result.answer.answer,/Which pet and year/);assert.equal(r.reads,0);
});

const {reconcileNoReadPet,reviewComponentCompletion,renderTaskCompletion}=await import('../app/lib/ask-read-only/task-components.mjs');
const owned=pets.map((p,i)=>({...p,handle:'p'+(i+1)}));
const scope=(plan=[task()],state={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]},question="Juniper's unrecorded description",rows=owned,binder=h=>rows.find(p=>p.handle===h))=>reconcileNoReadPet(plan,state,{question,selectedPet:'p1'},rows,'owned',binder);
test('identity reconciliation uses the existing bound owned pet, not selected UI identity',()=>{const r=scope();assert.deepEqual(r.plan[0].pets,['p2']);assert.deepEqual(r.plan[0].missing,[]);assert.equal(r.safety.referent,'clear');});
test('missing names, pronouns and Unicode substring matches do not resolve identity',()=>{for(const q of ['Her old mat was never described.','Juniperberry had a mat.','An unlisted pet had a mat.'])assert.equal(scope([task()],undefined,q),null);});
test('duplicate, competing, foreign and removed pet identities remain unresolved',()=>{assert.equal(scope([task()],undefined,'Willow and Juniper'),null);assert.equal(scope([task()],undefined,'Juniper',[...owned,{...owned[1],id:'duplicate-id',handle:'p3'}]),null);assert.equal(scope([task()],undefined,'Foreign',[...owned,{...owned[1],name:'Foreign',ownerId:'other',handle:'p3'}]),null);assert.equal(scope([task()],undefined,'Juniper',[owned[0]]),null);});
test('binder ownership and identity drift is rejected without read authority',()=>{for(const patch of [{ownerId:'other'},{id:'changed-id'}])assert.equal(scope(undefined,undefined,undefined,undefined,()=>({...owned[1],...patch})),null);});
test('source-free identity repair never resolves clinical authority or urgency',()=>{const base={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]};for(const patch of [{medicationIntent:'decision'},{careContext:'current_concern'},{scenario:'current'},{currentEvents:['collapse']},{conditionalEvents:['breathing_distress']},{missingContext:['medicine']}])assert.equal(scope([task()],{...base,...patch}),null);});
test('reads, signed references, multi-pet scope and owner facts are not inferred by no-read reconciliation',()=>{for(const patch of [{needsHistory:true,recordMode:'single'},{reference:'r1'},{pets:['p1','p2']},{needsOwnerFacts:true},{kind:'vet_brief'},{kind:'general_guidance'}])assert.equal(scope([task(patch)]),null);});
test('unknown detail limit preserves an independent useful general answer',()=>{const unavailable={...task({pets:['p2'],missing:[]}),status:'unresolved',reason:'source_unavailable',sources:[],componentIndexes:[0],ownerFacts:[],historyFacts:[]},general={...task({id:'t2',kind:'general_guidance',pets:[],missing:[]}),status:'complete',reason:'none',sources:[],componentIndexes:[1],ownerFacts:[],historyFacts:[]};const a=renderTaskCompletion({answer:'',validatedParts:[{index:0,text:'Invented blue squares.'},{index:1,text:'A useful independent explanation.'}],quotes:[],sources:[],calculations:[],presentation:{}},[unavailable,general],[],null);assert.match(a.answer,/useful independent explanation/);assert.match(a.answer,/verified saved information/);assert.doesNotMatch(a.answer,/blue squares|Which pet|Saved history:/);});
test('already admitted exact evidence is preserved rather than treated as unavailable',()=>{const row={handle:'s1',kind:'history',petId:pets[0].id,body:'One historical observation was saved.'};const f={components:[{kind:'saved',text:'Original observation.',sources:['s1']}],sources:['s1'],completion:[{task:'t1',status:'complete',reason:'none',componentIndexes:[0],sources:['s1'],ownerFacts:[],historyFacts:[{source:'s1',excerpt:row.body}]}]};const r=reviewComponentCompletion(f,[task({missing:[]})],[row],[],owned);assert.equal(r.tasks[0].status,'complete');assert.equal(r.tasks[0].historyFacts[0].excerpt,row.body);});

test('no-read reconciliation cannot clear a global ambiguity for an independent history task',()=>assert.equal(scope([task(),task({id:'t2',needsHistory:true,recordMode:'single',missing:[]})]),null));

test('nonclinical source-free detail cannot inherit a medicine clarification field',async()=>{
 const r=await execute({plan:[task({missing:['medicine']})]});
 assert.equal(r.calls,2);assert.equal(r.reads,0);
 assert.doesNotMatch(r.result.answer.answer,/Which medicine|blue squares/);
 assert.match(r.result.answer.answer,/verified saved information/);
 assert.deepEqual(r.contexts[1].taskPlan[0].missing,[]);
 assert.deepEqual(r.contexts[1].taskPlan[0].pets,['p2']);
});
test('no-read contract repair removes inapplicable medical fields but preserves independent date ambiguity',()=>{
 const r=scope([task({missing:['pet','medicine','year']})]);
 assert.deepEqual(r.plan[0].missing,['year']);
});
test('medical authority fields remain untouched for real medication, clinical and reference-dependent work',()=>{
 for(const patch of [{medicationIntent:'decision'},{careContext:'current_concern'},{scenario:'current'}]){
  const base={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[],...patch};
  assert.equal(scope([task({missing:['medicine']})],base),null);
 }
 assert.equal(scope([task({missing:['medicine'],needsHistory:true,recordMode:'single'})]),null);
 assert.equal(scope([task({missing:['medicine'],reference:'r1'})]),null);
});

for(const recordMode of ['single','collection'])test('unacquired '+recordMode+' evidence keeps identity distinct from source availability',async()=>{
 const r=await execute({plan:[task({needsHistory:true,recordMode})]});
 assert.equal(r.calls,2);assert.equal(r.reads,0);
 assert.doesNotMatch(r.result.answer.answer,/Which pet|blue squares/);
 assert.match(r.result.answer.answer,/verified saved information/);
 assert.equal(r.contexts[1].taskPlan[0].needsHistory,true);
 assert.equal(r.contexts[1].taskPlan[0].recordMode,recordMode);
 assert.deepEqual(r.contexts[1].taskPlan[0].pets,['p2']);
 assert.equal(r.result.answer.taskCompletion[0].status,'unresolved');
 assert.equal(r.result.answer.taskCompletion[0].reason,'source_unavailable');
});
test('composition-only identity binding never relaxes the selection-stage history gate',()=>{
 const p=[task({needsHistory:true,recordMode:'single'})],s={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]},context={question:"Juniper's old unknown detail"};
 const binder=h=>owned.find(p=>p.handle===h);
 assert.equal(reconcileNoReadPet(p,s,context,owned,'owned',binder),null);
 const r=reconcileNoReadPet(p,s,context,owned,'owned',binder,true);
 assert.deepEqual(r.plan[0].missing,[]);assert.equal(r.plan[0].needsHistory,true);assert.equal(r.plan[0].recordMode,'single');
 for(const bad of [[task({needsHistory:true,recordMode:'single',reference:'r1'})],[...p,task({id:'t2',needsHistory:true,recordMode:'single'})]]){
  assert.equal(reconcileNoReadPet(bad,s,context,owned,'owned',binder,true),null);
 }
 for(const patch of [{medicationIntent:'decision'},{careContext:'current_concern'},{scenario:'current'},{missingContext:['medicine']}]){
  assert.equal(reconcileNoReadPet(p,{...s,...patch},context,owned,'owned',binder,true),null);
 }
});

test('actual source-free clarification plan cannot ask again for an explicitly named owned pet',async()=>{
 const r=await execute({plan:[task({kind:'clarification'})]});
 assert.equal(r.calls,2);assert.equal(r.reads,0);
 assert.doesNotMatch(r.result.answer.answer,/Which pet|blue squares/);
 assert.match(r.result.answer.answer,/verified saved information/);
 assert.deepEqual(r.contexts[1].taskPlan[0].pets,['p2']);
 assert.deepEqual(r.contexts[1].taskPlan[0].missing,[]);
 assert.equal(r.result.answer.taskCompletion[0].reason,'source_unavailable');
});
test('clarification identity repair is closed-acquisition composition only',()=>{
 const p=[task({kind:'clarification'})],s={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]},context={question:"Juniper's unrecorded bowl words"};
 const bind=h=>owned.find(p=>p.handle===h);
 assert.equal(reconcileNoReadPet(p,s,context,owned,'owned',bind),null);
 const r=reconcileNoReadPet(p,s,context,owned,'owned',bind,true);
 assert.equal(r.plan[0].kind,'saved_content');
 assert.equal(r.plan[0].needsHistory,false);
 assert.equal(r.plan[0].recordMode,'none');
 assert.deepEqual(r.plan[0].missing,[]);
});
for(const patch of [
 {missing:['pet','year']},{missing:['medicine']},{missing:['pet','which_record']},
 {missing:[]},{needsHistory:true,recordMode:'single'},
 {reference:'r1'},{needsOwnerFacts:true},{pets:['p1','p2']}
])test('source-free clarification keeps unresolved independent scope '+JSON.stringify(patch),()=>{
 const p=[task({kind:'clarification',...patch})],s={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]};
 assert.equal(reconcileNoReadPet(p,s,{question:"Juniper's old detail"},owned,'owned',h=>owned.find(p=>p.handle===h),true),null);
});
test('clarification cannot borrow a missing explicit pet from UI, duplicate or foreign names',()=>{
 const p=[task({kind:'clarification'})],s={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]};
 for(const question of ['Her first bowl.','Juniperberry bowl.','Willow and Juniper bowl.','Foreign bowl.'])
  assert.equal(reconcileNoReadPet(p,s,{question},owned,'owned',h=>owned.find(p=>p.handle===h),true),null);
});
test('clarification cannot clear real medical authority or emergency scope',()=>{
 const p=[task({kind:'clarification'})],s={...safety(),scenario:'none',currentEvents:[],conditionalEvents:[]};
 for(const patch of [{medicationIntent:'decision'},{careContext:'current_concern'},{scenario:'current'},{currentEvents:['collapse']},{conditionalEvents:['breathing_distress']},{missingContext:['medicine']}])
  assert.equal(reconcileNoReadPet(p,{...s,...patch},{question:"Juniper's bowl"},owned,'owned',h=>owned.find(p=>p.handle===h),true),null);
});
