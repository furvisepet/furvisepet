import ts from 'typescript';
import {registerHooks} from 'node:module';
let muscleCalls=0;
globalThis.__publicCapabilityMuscleCall=()=>{muscleCalls++;};
registerHooks({load(url,context,next){
 const loaded=next(url,context);
 if(!url.endsWith('/app/lib/furvise-brain/muscle.ts'))return loaded;
 const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
 const ast=ts.createSourceFile(url,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='executeCalculatePlan');
 if(functions.length!==1||!functions[0].body)throw Error('MUSCLE_OBSERVER_TEST_FUNCTION_MISSING');
 const at=functions[0].body.getStart(ast)+1;
 return {...loaded,source:source.slice(0,at)+' globalThis.__publicCapabilityMuscleCall();'+source.slice(at)};
}});
const {assert,test,fixture,finish,calculation,slot,rawTicket,pets,buildCalculationLabs,calculationPublicationFailure}=await import('./helpers/calculation-public-fixture.mjs');
const {calculationCapability,PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS:yes,PUBLIC_V1_UNSUPPORTED_CALCULATION_OPERATORS:no,CALCULATION_CAPABILITY_LIMITATION}=await import('../app/lib/intelligence/calculation-capability.ts');
const {CALCULATE_OPERATORS}=await import('../app/lib/furvise-brain/calculate-plan.ts');
const {CALCULATION_LIMITATION}=await import('../app/lib/intelligence/calculation-labs.ts');
const {assessTaskExecution}=await import('../app/lib/intelligence/task-execution-contract.ts');
const node=(op,id='one')=>calculation(op,op==='count_records'?[]:op==='elapsed_days'?[slot(0,0,pets[0].name,'event_at',null),slot(1,0,pets[0].name,'event_at',null)]:op==='convert'?[slot(0)]:[slot(0),slot(1)],op==='count_records'?'records':op==='elapsed_days'?'day':op==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(op)?'%':'kg',id);
const cap=f=>calculationCapability(f.plan,f.input.evidenceContract.interpretation.request.readTicket);
async function limited(f){
 assert.equal(f.response.model,'server-calculation-unavailable');assert.equal(f.response.calculationLabs,undefined);
 assert.equal(f.response.answer.summary,CALCULATION_CAPABILITY_LIMITATION);assert.deepEqual(f.response.relevantContextIds,[]);
 assert.deepEqual(f.response.applicationActions,[]);assert.deepEqual(f.response.careActions,[]);
 const finalized=await finish(f);assert.equal(finalized.assessment.outcome,'limited');
 assert.ok(finalized.assessment.reasons.includes('unsupported_public_v1'));
 const settled=assessTaskExecution({assessment:finalized.assessment,completion:[],responseMode:'practical_guidance',actions:[],careWriteRequired:false,careReceipt:{status:'skipped',careEntryIds:[]}});
 assert.equal(settled.creditDisposition,'release');assert.equal(settled.taskOutcome,'limited');assert.equal(settled.mutationOutcome,'not_requested');assert.equal(f.calls(),0);
}
test('public v1 keeps the algebra but exposes no calculation execution',()=>{
 assert.deepEqual(yes,[]);assert.deepEqual([...no].sort(),[...CALCULATE_OPERATORS].sort());assert.equal(new Set(no).size,10);
});
for(const op of CALCULATE_OPERATORS)test('legal '+op+' binds but public capability withholds execution and credit',async()=>{
 const before=muscleCalls,f=await fixture({calculations:[node(op)],ticket:rawTicket(op==='count_records')});
 assert.deepEqual(cap(f),{supported:false,reason:'unsupported_public_v1',unsupportedOperators:[op]});
 await limited(f);assert.equal(muscleCalls,before);
 const rows=new Proxy([],{get(){throw Error('OPERAND_TRANSPORT_MUST_NOT_BE_READ');}});
 assert.equal(buildCalculationLabs(f.input.evidenceContract,rows),null);assert.equal(muscleCalls,before);
});
const ref=(role,id)=>({kind:'result',role,calculationId:id});
const derived=(op,id,inputs,unit='kg')=>({id,operator:op,operands:inputs,resultUnit:unit,precision:null});
const plans=[
 ['formerly supported chain',[node('sum','a'),derived('convert','b',[ref('source','a')],'g')]],
 ['mixed chain',[node('sum','a'),derived('difference','b',[ref('target','a'),ref('reference','a')])]],
 ['formerly supported independent nodes',[node('sum','a'),node('mean','b')]],
];
for(const [label,calculations]of plans)test('plan-wide '+label+' is unavailable',async()=>{
 const before=muscleCalls,f=await fixture({calculations,resultSelection:null});assert.equal(cap(f).supported,false);
 await limited(f);assert.equal(muscleCalls,before);
});
test('snapshot changes cannot mint an allowed capability',async()=>{
 const f=await fixture({calculations:[node('difference')]});
 const clone=structuredClone(f.plan);clone.calculations[0].operator='absolute_difference';clone.calculations[0].operands.forEach(o=>o.role='member');
 assert.throws(()=>calculationCapability(clone,f.input.evidenceContract.interpretation.request.readTicket),/binding_snapshot/);
});
test('capability limitation cannot be substituted with evidence limitation, facts or actions',async()=>{
 const f=await fixture({calculations:[node('difference')]});
 for(const mutate of [
  r=>r.answer.summary=CALCULATION_LIMITATION,
  r=>r.answer.summary+=' A stored value is 7.',
  r=>r.relevantContextIds=['care:invented'],
  r=>r.applicationActions=[{kind:'save'}],
  r=>r.model='server-calculation-labs',
  r=>r.calculationLabs={}
 ]){
  const changed={...f.response,answer:{...f.response.answer}};mutate(changed);assert.ok(calculationPublicationFailure(changed));
 }
 assert.equal(calculationPublicationFailure(f.response),null);
});
