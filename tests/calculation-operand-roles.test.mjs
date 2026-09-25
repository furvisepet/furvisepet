import Ajv from 'ajv';
import {assert,test,bindCalculatePlan,rebindCalculatePlan,bindTypedReadTicket,executeCalculatePlan,pets,row,rawTicket,slot,calculation,envelope,fixture,finish,askRequestProviderSchema,validateAskRequest,calculationPublicationFailure} from './helpers/calculation-fixture.mjs';
import {CALCULATE_ROLES,CALCULATE_OPERATORS,CALCULATION_ROLE_POLICY,requiresCalculateBinding,carryCalculatePlan} from '../app/lib/furvise-brain/calculate-plan.ts';
import {carryCalculationLabs,serializeCalculationLabs} from '../app/lib/intelligence/calculation-labs.ts';
const direct=(role,clause=0,field='measurement')=>({...slot(clause,0,pets[0].name,field,field==='event_at'?null:'kg'),measurementSelector:null,role});
const ref=(role,calculationId)=>({kind:'result',role,calculationId});
const node=(operator,operands,resultUnit='kg',id='out')=>({id,operator,operands,resultUnit,precision:null});
const plan=calculations=>({operation:'calculate',calculations,resultSelection:null});
const ticket=(count=false)=>bindTypedReadTicket(rawTicket(count),[pets[0].id]);
const bind=(c,t=ticket())=>bindCalculatePlan(plan([c]),t,pets);
const sources=()=>[row('early','sample 2 kg',1),row('late','sample 6 kg',3)];
const cases=[
 ['difference',[direct('reference'),direct('target',1)],'kg',4],
 ['ratio',[direct('reference'),direct('target',1)],'scalar',3],
 ['percent_change',[direct('reference'),direct('target',1)],'%',200],
 ['absolute_difference',[direct('member'),direct('member',1)],'kg',4],
 ['elapsed_days',[direct('start',0,'event_at'),direct('end',1,'event_at')],'day',2],
 ['convert',[direct('source')],'g',2000],
 ['sum',[direct('member'),direct('member',1)],'kg',8],
 ['mean',[direct('member'),direct('member',1)],'kg',4],
 ['percent_of_sum',[direct('member',1),direct('part')],'%',25],
 ['count_records',[],'records',2],
];
test('closed role vocabulary and operator policy cover exactly the current algebra',()=>{
 assert.deepEqual(CALCULATE_ROLES,['target','reference','start','end','part','source','member']);
 assert.deepEqual(Object.keys(CALCULATION_ROLE_POLICY).sort(),[...CALCULATE_OPERATORS].sort());
});
for(const [operator,operands,unit,value] of cases)for(const reversed of [false,true])test(operator+' executes roles independently of array order '+reversed,async()=>{
 const ops=structuredClone(operands);if(reversed)ops.reverse();
 const f=await fixture({sourceRows:sources(),ticket:rawTicket(operator==='count_records'),calculations:[node(operator,ops,unit)]});
 assert.equal(f.response.model,'server-calculation-labs');
 const r=f.response.calculationLabs.execution.results[0];assert.equal(r.value,value);
 assert.deepEqual(r.exact,{numerator:String(value),denominator:'1'});
 assert.deepEqual(r.operands.map(o=>o.slot.role),ops.map(o=>o.role));
 assert.deepEqual([...r.sourceIds].sort(),operator==='convert'?['care:early']:['care:early','care:late']);
 assert.doesNotMatch(f.response.answer.summary,/input [01]|operand [01]|baseline 0/);
 for(const role of new Set(ops.map(o=>o.role)))assert.ok(f.response.answer.summary.includes(role[0].toUpperCase()+role.slice(1)+':'));
 assert.equal(calculationPublicationFailure(f.response),null);await finish(f);
});
for(const [operator,ops,unit] of cases.filter(c=>c[1].length)){
 for(const invalid of ['unknown','missing','wrong-type'])test(operator+' rejects '+invalid+' role before source binding',()=>{
  const c=node(operator,structuredClone(ops),unit);if(invalid==='missing')delete c.operands[0].role;else c.operands[0].role=invalid==='wrong-type'?null:'baseline';
  assert.throws(()=>bind(c),/ASK_CALCULATE_INVALID:operand_role$/);
 });
 const legal=new Set(Object.keys(CALCULATION_ROLE_POLICY[operator].roles));
 for(const role of CALCULATE_ROLES.filter(r=>!legal.has(r)))test(operator+' rejects illegal operator role '+role,()=>{
  const c=node(operator,structuredClone(ops),unit);c.operands[0].role=role;assert.throws(()=>bind(c),/ASK_CALCULATE_INVALID:operand_role$/);
 });
}
for(const operator of ['difference','ratio','percent_change','elapsed_days']){
 const base=cases.find(c=>c[0]===operator);
 for(const unique of base[1].map(o=>o.role))test(operator+' rejects duplicated '+unique+' and missing companion',()=>{
  const c=node(operator,base[1].map(o=>({...o,role:unique})),base[2]);assert.throws(()=>bind(c),/operand_role_cardinality/);
 });
 for(const missing of base[1].map(o=>o.role))test(operator+' rejects absent '+missing,()=>{
  assert.throws(()=>bind(node(operator,base[1].filter(o=>o.role!==missing),base[2])),/ASK_CALCULATE_INVALID:arity/);
 });
}
for(const n of [1,3])test('absolute difference rejects '+n+' members',()=>assert.throws(()=>bind(node('absolute_difference',Array.from({length:n},()=>direct('member')))),/arity/));
for(const roles of [['part','part'],['member','member'],['part']])test('percent_of_sum rejects '+roles.join('/'),()=>{
 assert.throws(()=>bind(node('percent_of_sum',roles.map(r=>direct(r)),'%')),/operand_role_cardinality|arity/);
});
test('count cannot accept an operand with any role',()=>assert.throws(()=>bind(node('count_records',[direct('member')],'records'),ticket(true)),/exhaustive_count/));
for(const operator of ['sum','mean'])for(const n of [1,2,64])test(operator+' retains '+n+' identical member occurrences',async()=>{
 const f=await fixture({sourceRows:sources(),calculations:[node(operator,Array.from({length:n},()=>direct('member')))]});
 const r=f.response.calculationLabs.execution.results[0];assert.equal(r.value,operator==='sum'?2*n:2);assert.equal(r.operands.length,n);assert.deepEqual(r.sourceIds,['care:early']);await finish(f);
});
for(const operator of ['sum','mean'])for(const n of [0,65])test(operator+' rejects member count '+n,()=>assert.throws(()=>bind(node(operator,Array.from({length:n},()=>direct('member')))),/arity|calculation/));
test('percent_of_sum includes the part and every repeated member in denominator',async()=>{
 const f=await fixture({sourceRows:sources(),calculations:[node('percent_of_sum',[direct('member',1),direct('part'),direct('member',1)],'%')]});
 const r=f.response.calculationLabs.execution.results[0];assert.deepEqual(r.exact,{numerator:'100',denominator:'7'});assert.equal(r.operands.length,3);await finish(f);
});
const leaves=()=>[node('convert',[direct('source')],'kg','a'),node('convert',[direct('source',1)],'kg','b')];
const derivedCases=[
 ['difference',[ref('reference','a'),ref('target','b')],'kg',4],
 ['ratio',[ref('reference','a'),ref('target','b')],'scalar',3],
 ['percent_change',[ref('reference','a'),ref('target','b')],'%',200],
 ['convert',[ref('source','a')],'g',2000],
 ['sum',[ref('member','a'),ref('member','a')],'kg',4],
 ['mean',[ref('member','a'),ref('member','a'),ref('member','b')],'kg',10/3],
 ['absolute_difference',[ref('member','a'),ref('member','b')],'kg',4],
 ['percent_of_sum',[ref('member','b'),ref('part','a'),ref('member','b')],'%',100/7],
 ['difference',[ref('reference','a'),ref('target','a')],'kg',0],
];
for(const [operator,operands,unit,value] of derivedCases)for(const reversed of [false,true])test('derived '+operator+' roles and multiplicity '+operands.map(o=>o.calculationId).join('/')+' reversed '+reversed,async()=>{
 const ops=structuredClone(operands);if(reversed)ops.reverse();
 const f=await fixture({sourceRows:sources(),calculations:[...leaves(),node(operator,ops,unit)],resultSelection:null});
 const r=f.response.calculationLabs.execution.results.at(-1);assert.equal(r.value,value);
 assert.deepEqual(r.upstreamResults.map(o=>[o.role,o.calculationId]),ops.map(o=>[o.role,o.calculationId]));
 assert.deepEqual([...r.sourceIds].sort(),ops.some(o=>o.calculationId==='b')?['care:early','care:late']:['care:early']);
 const copy=structuredClone(f.response);carryCalculationLabs(f.response,copy);assert.equal(calculationPublicationFailure(copy),null);
 assert.doesNotMatch(copy.answer.summary,/input [01]|operand [01]/);await finish(f);
});
for(const id of ['out','future','absent'])test('typed derived role cannot bypass backward reference '+id,()=>{
 const c=[...leaves(),node('convert',[ref('source',id)],'g')];if(id==='future')c.push(node('convert',[direct('source')],'kg','future'));
 assert.throws(()=>bindCalculatePlan(plan(c),ticket(),pets),/backward_reference/);
});
for(const [operator,ops,unit] of cases)test('every non-null plan requires trusted snapshot: '+operator,()=>{
 const t=ticket(operator==='count_records'),p=bind(node(operator,ops,unit),t),copy=JSON.parse(JSON.stringify(p));
 assert.equal(requiresCalculateBinding(p),true);assert.throws(()=>rebindCalculatePlan(copy,t),/binding_snapshot/);
 assert.deepEqual(rebindCalculatePlan(copy,t,p),p);carryCalculatePlan(p,copy,t);assert.deepEqual(rebindCalculatePlan(copy,t),p);
});
for(const role of ['target','reference'])test('simple direct snapshot detects changing only '+role,()=>{
 const t=ticket(),p=bind(node('difference',[direct('target',1),direct('reference')]),t),copy=structuredClone(p);
 copy.calculations[0].operands.find(o=>o.role===role).role=role==='target'?'reference':'target';
 assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);assert.throws(()=>carryCalculatePlan(p,copy,t),/binding_snapshot/);
});
for(const change of ['reverse','duplicate','remove'])test('member snapshot detects '+change+' of serialized occurrences',()=>{
 const t=ticket(),p=bind(node('sum',[direct('member'),direct('member',1)]),t),copy=structuredClone(p),ops=copy.calculations[0].operands;
 if(change==='reverse')ops.reverse();if(change==='duplicate')ops.push({...ops[0]});if(change==='remove')ops.pop();
 assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);
});
test('derived consuming role changes invalidate plan snapshots',()=>{
 const t=ticket(),p=bindCalculatePlan(plan([...leaves(),node('difference',[ref('target','b'),ref('reference','a')])]),t,pets),copy=structuredClone(p);
 copy.calculations.at(-1).operands[0].role='reference';assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);
});
for(const field of ['direct provenance','derived provenance','plan'])test('Labs publication rejects changed '+field+' role',async()=>{
 const f=await fixture({sourceRows:sources(),calculations:[...leaves(),node('difference',[ref('target','b'),ref('reference','a')])],resultSelection:null});
 const copy=structuredClone(f.response);carryCalculationLabs(f.response,copy);assert.equal(calculationPublicationFailure(copy),null);
 if(field==='direct provenance')copy.calculationLabs.execution.results[0].operands[0].slot.role='target';
 if(field==='derived provenance')copy.calculationLabs.execution.results.at(-1).upstreamResults[0].role='reference';
 if(field==='plan')copy.calculationLabs.calculatePlan.calculations.at(-1).operands[0].role='reference';
 assert.ok(calculationPublicationFailure(copy));assert.equal(f.calls(),0);
});
test('bounded endpoint calculation uses declared roles with either array order',async()=>{
 const t=rawTicket();Object.assign(t.temporal,{from:'2024-01-01T00:00:00Z',to:'2024-01-04T00:00:00Z'});
 for(const ops of [[direct('reference'),direct('target',1)],[direct('target',1),direct('reference')]]){
  const f=await fixture({sourceRows:[row('before','sample 99 kg',0),...sources(),row('after','sample 88 kg',4)],ticket:t,calculations:[node('difference',ops)]});
  const r=f.response.calculationLabs.execution.results[0];assert.equal(r.value,4);assert.deepEqual([...r.sourceIds].sort(),['care:early','care:late']);
  assert.deepEqual(r.operands.map(o=>[o.slot.role,o.recordId]),ops.map(o=>[o.role,o.clause?'late':'early']));
  assert.equal(calculationPublicationFailure(f.response),null);await finish(f);
 }
});
const context={owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:'Calculate from saved observations.',conversationTurns:[],timeZone:'UTC'};
const schema=askRequestProviderSchema({type:'object',additionalProperties:false,required:[],properties:{}},context),check=new Ajv({allErrors:true}).compile(schema);
const request=c=>{const t={...rawTicket(c.operator==='count_records'),subjectScope:'named',episode:null,searchHints:[],probes:[]};t.temporal.calendar=null;if(c.operator==='count_records')t.outputs.strategy=null;
 return {...envelope(plan([c]),t),outputFormat:null,temporalScope:'historical',profileFields:[],evidenceNeeds:[],excludedPetNames:[],mutationIntent:null,projection:null,recordSelection:null,task:null,storedRead:null,appendJob:null,writeJob:null,removeJob:null,fieldMutationJob:null,stateTransitionJob:null,lifecyclePlan:null};};
for(const [operator,ops,unit] of cases)test('provider and Binder require legal roles for '+operator,()=>{
 const r=request(node(operator,structuredClone(ops),unit));assert.equal(check({request:r}),true,JSON.stringify(check.errors));assert.ok(validateAskRequest(r,context).request.calculatePlan);
 if(!ops.length)return;
 for(const role of [undefined,'baseline',...CALCULATE_ROLES.filter(k=>!Object.hasOwn(CALCULATION_ROLE_POLICY[operator].roles,k))]){
  const bad=structuredClone(r);if(role===undefined)delete bad.calculatePlan.calculations[0].operands[0].role;else bad.calculatePlan.calculations[0].operands[0].role=role;
  assert.equal(check({request:bad}),false);assert.throws(()=>validateAskRequest(bad,context),/operand_role/);
 }
});
test('provider restricts result operand roles and Binder owns exact role cardinality',()=>{
 const r=request(node('difference',[direct('reference'),direct('target',1)]));r.calculatePlan.calculations.push(node('difference',[ref('reference','out'),ref('target','out')],'kg','derived'));
 assert.equal(check({request:r}),true);assert.ok(validateAskRequest(r,context).request.calculatePlan);
 r.calculatePlan.calculations[1].operands[0].role='target';assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/operand_role_cardinality/);
 r.calculatePlan.calculations[1].operands[0].role='member';assert.equal(check({request:r}),false);assert.throws(()=>validateAskRequest(r,context),/operand_role/);
});
