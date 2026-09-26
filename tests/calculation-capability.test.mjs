import {registerHooks} from 'node:module';
let muscleCalls=0;
globalThis.__publicCapabilityMuscleCall=()=>{muscleCalls++;};
registerHooks({load(url,context,next){
 const loaded=next(url,context);
 if(!url.endsWith('/app/lib/furvise-brain/muscle.ts'))return loaded;
 const source=String(loaded.source),needle=' const results:CalculationResult[]=[];';
 if(source.split(needle).length!==2)throw Error('MUSCLE_OBSERVER_TEST_SEAM_CHANGED');
 return {...loaded,source:source.replace(needle,' globalThis.__publicCapabilityMuscleCall();'+needle)};
}});
const {assert,test,fixture,finish,calculation,slot,rawTicket,pets,bindCalculatePlan,bindTypedReadTicket,buildCalculationLabs,calculationPublicationFailure}=await import('./helpers/calculation-public-fixture.mjs');
const {calculationCapability,PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS:yes,PUBLIC_V1_UNSUPPORTED_CALCULATION_OPERATORS:no}=await import('../app/lib/intelligence/calculation-capability.ts');
const {CALCULATE_OPERATORS}=await import('../app/lib/furvise-brain/calculate-plan.ts');
const {assessTaskExecution}=await import('../app/lib/intelligence/task-execution-contract.ts');
const node=(op,id='one')=>calculation(op,op==='count_records'?[]:op==='elapsed_days'?[slot(0,0,pets[0].name,'event_at',null),slot(1,0,pets[0].name,'event_at',null)]:op==='convert'?[slot(0)]:[slot(0),slot(1)],op==='count_records'?'records':op==='elapsed_days'?'day':op==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(op)?'%':'kg',id);
const cap=f=>calculationCapability(f.plan,f.input.evidenceContract.interpretation.request.readTicket);
test('public v1 exposes the full typed calculation algebra',()=>{
 assert.deepEqual([...yes].sort(),[...CALCULATE_OPERATORS].sort());assert.deepEqual(no,[]);assert.equal(new Set(yes).size,10);
});
for(const op of CALCULATE_OPERATORS)test('legal '+op+' executes through certified Calculation Labs',async()=>{
 const before=muscleCalls,f=await fixture({calculations:[node(op)],ticket:rawTicket(op==='count_records')});
 assert.deepEqual(cap(f),{supported:true,reason:'supported',unsupportedOperators:[]});
 assert.equal(f.response.model,'server-calculation-labs');
 assert.ok(f.response.calculationLabs);
 assert.equal(calculationPublicationFailure(f.response),null);
 assert.ok(muscleCalls>before);
 assert.equal(f.calls(),0);
 await finish(f);
});
const ref=(role,id)=>({kind:'result',role,calculationId:id});
const derived=(op,id,inputs,unit='kg')=>({id,operator:op,operands:inputs,resultUnit:unit,precision:null});
const plans=[
 ['sum to conversion chain',[node('sum','a'),derived('convert','b',[ref('source','a')],'g')]],
 ['difference chain',[node('sum','a'),derived('difference','b',[ref('target','a'),ref('reference','a')])]],
 ['independent sum and mean',[node('sum','a'),node('mean','b')]],
];
for(const [label,calculations]of plans)test('plan-wide '+label+' executes',async()=>{
 const f=await fixture({calculations,resultSelection:null});assert.equal(cap(f).supported,true);
 assert.equal(f.response.model,'server-calculation-labs');assert.equal(calculationPublicationFailure(f.response),null);assert.equal(f.calls(),0);
 await finish(f);
});
test('snapshot changes cannot mint an allowed capability',async()=>{
 const f=await fixture({calculations:[node('difference')]});
 const clone=structuredClone(f.plan);clone.calculations[0].operator='absolute_difference';clone.calculations[0].operands.forEach(o=>o.role='member');
 assert.throws(()=>calculationCapability(clone,f.input.evidenceContract.interpretation.request.readTicket),/binding_snapshot/);
});
test('certified calculation publication cannot be widened or altered',async()=>{
 const f=await fixture({calculations:[node('difference')]});
 assert.equal(calculationPublicationFailure(f.response),null);
 for(const mutate of [
  r=>r.answer.summary+=' changed',
  r=>r.relevantContextIds=['care:invented'],
  r=>r.applicationActions=[{kind:'save'}],
  r=>r.model='server-calculation-unavailable',
  r=>r.calculationLabs.execution.complete=false
 ]){
  const changed=structuredClone(f.response);
  mutate(changed);
  assert.ok(calculationPublicationFailure(changed));
 }
});
