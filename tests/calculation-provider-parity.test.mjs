import Ajv from 'ajv';
import {alternatives,assertOperandContracts} from './helpers/producer-contract-inventory.mjs';
import {assert,test,bindCalculatePlan,pets,rawTicket,slot,calculation,envelope,askRequestProviderSchema,validateAskRequest} from './helpers/calculation-fixture.mjs';
const context={owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:'Calculate from saved observations.',conversationTurns:[],currentTurn:{id:'source',role:'user',text:'Calculate from saved observations.'},timeZone:'UTC'};
const schema=askRequestProviderSchema({type:'object',additionalProperties:false,required:[],properties:{}},context),check=new Ajv({allErrors:true}).compile(schema);
const operand=(...a)=>({...slot(...a),measurementSelector:null});
const request=(count=false)=>{const ticket={...rawTicket(count),subjectScope:'named',episode:null,searchHints:[],probes:[]};ticket.temporal.calendar=null;if(count)ticket.outputs.strategy=null;return {...envelope({operation:'calculate',resultSelection:null,calculations:[count?calculation('count_records',[],'records'):calculation('difference',[operand(1),operand(0)])]},ticket),outputFormat:null,temporalScope:'historical',profileFields:[],evidenceNeeds:[],excludedPetNames:[],mutationIntent:null,projection:null,recordSelection:null,task:null,storedRead:null,appendJob:null,writeJob:null,removeJob:null,fieldMutationJob:null,stateTransitionJob:null,lifecyclePlan:null};};
const assignFixtureRoles=c=>{c.operands=calculation(c.operator,c.operands.map(({role,...o})=>o),c.resultUnit,c.id).operands;};
const accepts=r=>{assert.equal(check({request:r}),true,JSON.stringify(check.errors));return validateAskRequest(structuredClone(r),context);};
const rejects=r=>{assert.equal(check({request:r}),false);assert.throws(()=>validateAskRequest(structuredClone(r),context));};
for(const operator of ['sum','mean','difference','absolute_difference','ratio','percent_change','percent_of_sum','convert','elapsed_days'])test(operator+' cannot reference read slots without selection',()=>{const r=request();r.calculatePlan.calculations[0].operator=operator;r.readTicket.selection=null;rejects(r);});
for(const operator of ['difference','mean','convert','elapsed_days'])test(operator+' with a legal selection passes schema and Binder',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;if(operator==='convert')c.operands=[operand(0)];if(operator==='elapsed_days'){c.operands=[operand(0,0,pets[0].name,'event_at',null),operand(1,0,pets[0].name,'event_at',null)];c.resultUnit='day';}assignFixtureRoles(c);assert.equal(accepts(r).request.calculatePlan.calculations[0].operator,operator);});
test('exhaustive unbounded count-only plan needs no selection',()=>{const r=request(true);assert.equal(accepts(r).request.calculatePlan.calculations[0].operator,'count_records');});
test('multiple legal count nodes remain allowed',()=>{const r=request(true);r.calculatePlan.calculations.push({...r.calculatePlan.calculations[0],id:'second'});assert.equal(accepts(r).request.calculatePlan.calculations.length,2);});
for(const [name,edit]of [['selection',r=>r.readTicket.selection=rawTicket().selection],['sufficient',r=>r.readTicket.outputs.completeness='sufficient'],['limit',r=>r.readTicket.outputs.limit=1],['operand',r=>r.calculatePlan.calculations[0].operands=[operand(0)]],['result unit',r=>r.calculatePlan.calculations[0].resultUnit='scalar'],['result selection',r=>r.calculatePlan.resultSelection={filter:null,orderBy:{direction:'desc'},take:null}]])test('count rejects '+name,()=>{const r=request(true);edit(r);rejects(r);});
test('count and selected calculations cannot share an incompatible ticket',()=>{for(const count of [true,false]){const r=request(count);r.calculatePlan.calculations.push({...request(!count).calculatePlan.calculations[0],id:'second'});rejects(r);}});
for(const [name,edit]of [['clause',r=>r.calculatePlan.calculations[0].operands[0].clause=2],['item',r=>r.calculatePlan.calculations[0].operands[0].item=1]])test('runtime '+name+' bounds remain Binder-owned',()=>{const r=request();edit(r);assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/ASK_CALCULATE_INVALID:position/);});
const dag=()=>{const r=request();r.calculatePlan.calculations.push(calculation('convert',[{kind:'result',calculationId:'c1'}],'g','derived'));return r;};
test('derived result node preserves upstream read selection authority',()=>{assert.equal(accepts(dag()).request.calculatePlan.calculations[1].operands[0].calculationId,'c1');});
test('DAG cannot omit overall read selection',()=>{const r=dag();r.readTicket.selection=null;rejects(r);});
test('DAG resultSelection restriction remains Binder-owned',()=>{const r=dag();r.calculatePlan.resultSelection={filter:null,orderBy:{direction:'desc'},take:null};assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/dag_result_selection/);});
test('DAG backward-only reference binding is unchanged',()=>{const r=dag();r.calculatePlan.calculations[1].operands[0].calculationId='future';assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/backward_reference/);});
for(const count of [false,true])for(const [name,edit]of [['episode',r=>r.readTicket.episode={operation:'count',referent:{}}],['needs',r=>r.readTicket.needs=[{}]],['probes',r=>r.readTicket.probes=[{}]],['strategy',r=>r.readTicket.outputs.strategy='chronological'],['calendar',r=>r.readTicket.temporal.calendar='oldest_year'],['compare',r=>r.readTicket.operation='compare'],['rank',r=>r.readTicket.operation='rank']])test((count?'count':'selected')+' calculation rejects '+name,()=>{const r=request(count);edit(r);if(count&&name==='strategy'){assert.equal(check({request:r}),false);assert.throws(()=>bindCalculatePlan(r.calculatePlan,{...r.readTicket,subjects:{petIds:[pets[0].id]}},pets),/exhaustive_count/);}else rejects(r);});
for(const count of [false,true])test((count?'count':'selected')+' calculation preserves semantic anchors',()=>{const r=request(count);r.readTicket.operation='read_since_event';r.readTicket.temporal.anchor={concept:'procedure',relation:'after'};assert.equal(accepts(r).request.readTicket.operation,'read_since_event');});
test('selected calculations retain exhaustive reads and global transport caps',()=>{const r=request();r.readTicket.outputs.completeness='exhaustive';r.readTicket.outputs.limit=3;accepts(r);});
test('provider schemas remain closed and fully required without conditional keywords',()=>{const visit=n=>{if(!n||typeof n!=='object')return;for(const k of ['if','then','oneOf'])assert.equal(Object.hasOwn(n,k),false);if(n.properties){assert.equal(n.additionalProperties,false);assert.deepEqual([...n.required].sort(),Object.keys(n.properties).sort());}for(const v of Object.values(n))Array.isArray(v)?v.forEach(visit):visit(v);};visit(schema);});

const measurementOperators=['sum','mean','difference','absolute_difference','ratio','percent_change','percent_of_sum','convert'];
for(const operator of measurementOperators)test(operator+' provider rejects null measurement unit',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;if(operator==='convert')c.operands=[operand(0)];assignFixtureRoles(c);c.operands[0].unit=null;rejects(r);});
for(const operator of measurementOperators)test(operator+' provider rejects event-time operands',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;c.operands=(operator==='convert'?[0]:[0,1]).map(i=>operand(i,0,pets[0].name,'event_at',null));assignFixtureRoles(c);rejects(r);});
const elapsedRequest=()=>{const r=request();Object.assign(r.calculatePlan.calculations[0],{operator:'elapsed_days',operands:[0,1].map(i=>operand(i,0,pets[0].name,'event_at',null)),resultUnit:'day'});assignFixtureRoles(r.calculatePlan.calculations[0]);return r;};
for(const [name,edit] of [['non-null unit',r=>r.calculatePlan.calculations[0].operands[0].unit='day'],['selector',r=>r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[0]}],['measurement field',r=>r.calculatePlan.calculations[0].operands[0]={...operand(0),role:'start'}]])test('elapsed provider rejects '+name,()=>{const r=elapsedRequest();edit(r);rejects(r);});
test('elapsed event-time operands bind with null unit and selector',()=>{accepts(elapsedRequest());});
test('all registry units remain available for explicit measurement slots',async()=>{const {units}=await import('../app/lib/furvise-brain/calculation-units.ts');for(const unit of Object.keys(units)){const r=request(),c=r.calculatePlan.calculations[0];c.operands.forEach(o=>o.unit=unit);c.resultUnit=unit;accepts(r);}});
for(const operator of measurementOperators)test('derived '+operator+' retains result-only operand authority',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator=operator;c.operands=Array(operator==='convert'?1:2).fill(null).map(()=>({kind:'result',calculationId:'c1'}));c.resultUnit=operator==='convert'?'g':operator==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(operator)?'%':'kg';assignFixtureRoles(c);accepts(r);});
test('derived elapsed remains rejected by provider and Binder',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator='elapsed_days';c.operands=[{kind:'result',calculationId:'c1'},{kind:'result',calculationId:'c1'}];c.resultUnit='day';assignFixtureRoles(c);rejects(r);});
test('provider rejects mixed direct and result operands',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator='sum';c.resultUnit='kg';c.operands.push(operand(0));assignFixtureRoles(c);rejects(r);});
test('measurement selector identity remains Binder-owned',()=>{const r=request();r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[5]};assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/measurement_selector/);});
test('valid measurement selector structure preserves binding',()=>{const r=request();r.readTicket.predicates=[{kind:'text_any',terms:['sample']}];r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[0]};accepts(r);});

import {ASK_REQUEST_INSTRUCTIONS} from '../app/lib/intelligence/ask-request-contract.ts';
// Contract descriptions are checked here, not live model compliance.
const roleChecks=[
 ['difference',['exactly one target and one reference','target - reference']],
 ['percent_change',['reference is the baseline','(target - reference) / reference * 100']],
 ['ratio',['exactly one target and one reference','target / reference']],
 ['elapsed_days',['exactly one start and one end','(end - start) / 86400000']],
 ['percent_of_sum',['exactly one part','one to 63 member','part / (part + sum(members)) * 100']],
 ['absolute_difference',['exactly two member','absolute difference','independent of member order']],
 ['sum',['one to 64 member','every occurrence']],
 ['mean',['one to 64 member','divided by member count']],
 ['convert',['exactly one source','resultUnit']],
 ['count_records',['no operands','certified effective record count']],
];
const providerNodes=schema.properties.request.anyOf.filter(v=>v.properties.version?.enum?.[0]==='ask-request.v2' && v.properties.calculatePlan?.type==='object').flatMap(v=>{
 const arrays=v.properties.calculatePlan.properties.calculations;
 return (arrays.anyOf||[arrays]).flatMap(array=>array.items.anyOf||[array.items]);
});
for(const [operator,terms] of roleChecks)test(operator+' semantic roles are explicit in instructions and each provider operand branch',()=>{
 const line=ASK_REQUEST_INSTRUCTIONS.split('\n').find(s=>s.startsWith(operator+':'));assert.ok(line,operator);
 const nodes=providerNodes.filter(n=>n.properties.operator.enum.includes(operator));assert.ok(nodes.length);
 for(const term of terms){assert.ok(line.includes(term),term);for(const node of nodes)for(const field of ['operator'])assert.ok(node.properties[field].description.includes(term),operator+' '+field+' '+term);}
});
test('selection addresses do not assign arithmetic roles for read, premise or derived operands',()=>{
 assert.ok(ASK_REQUEST_INSTRUCTIONS.includes('Array position is never operand meaning.'));
 for(const node of providerNodes.filter(n=>n.properties.operator.enum[0]!=='count_records')){
  for(const operand of alternatives(node.properties.operands.items)){
   assert.ok(operand.required.includes('role'));
   assert.ok(operand.properties.role.enum.length);
  }
 }
});

for(const [field,value] of [['from','2024-02-01'],['to','2024-03-01'],['terms',['sample']],['selection','comparison']])test('calculation provider neutralizes outer '+field,()=>{
 const r=request();r[field]=value;assert.equal(check({request:r}),false);
});
test('typed calculation window survives Binder with neutral outer retrieval fields',()=>{
 const r=request();r.readTicket.temporal.from='2024-12-31T00:00:00-08:00';r.readTicket.temporal.to='2025-01-02T00:00:00-08:00';
 const bound=accepts(r);assert.deepEqual(bound.request.readTicket.temporal,r.readTicket.temporal);
 assert.equal(r.from,null);assert.equal(r.to,null);assert.deepEqual(r.terms,[]);assert.equal(r.selection,'summary');
});
test('legacy outer dates cannot fill an unbounded typed calculation ticket',()=>{
 const r=request();r.from='2024-02-01';r.to='2024-03-01';r.terms=['sample'];r.selection='comparison';
 const bound=validateAskRequest(r,context);assert.equal(bound.request.readTicket.temporal.from,null);assert.equal(bound.request.readTicket.temporal.to,null);assert.deepEqual(bound.request.readTicket.predicates,r.readTicket.predicates);
});
test('non-calculation provider compatibility retains outer fields',()=>{
 const r=request();r.calculatePlan=null;r.from='2024-02-01';r.to='2024-03-01';r.terms=['sample'];r.selection='comparison';
 assert.equal(check({request:r}),true,JSON.stringify(check.errors));assert.equal(validateAskRequest(r,context).request.readTicket.temporal.from,null);
});
test('canonical calculation contract owns temporal bounds and distinct endpoint union',()=>{
 for(const term of ['outer from/to null, terms [], selection summary','next local midnight in the supplied timezone','distinct ascending take 1 and descending take 1','duplicate clauses are invalid'])assert.ok(ASK_REQUEST_INSTRUCTIONS.includes(term),term);
 for(const v of schema.properties.request.anyOf.filter(v=>v.properties.version?.enum?.[0]==='ask-request.v2' && v.properties.calculatePlan?.type==='object')){
  if(v.properties.evidenceBasis.enum[0]==='supplied_context'){assert.equal(v.properties.readTicket.type,'null');continue;}
  assert.match(v.properties.readTicket.properties.temporal.description,/Sole temporal retrieval authority/);
  if(v.properties.readTicket.properties.selection.type==='object')assert.match(v.properties.readTicket.properties.selection.description,/Never duplicate orderBy\/take/);
 }
});

for(const count of [false,true])test((count?'count':'selected')+' calculation requires complete temporal instants before binding',()=>{
 for(const field of ['from','to']){const r=request(count);r.readTicket.temporal[field]='2024-12-31';
  assert.equal(check({request:r}),false);assert.throws(()=>validateAskRequest(r,context),e=>e.cause?.field==='temporal.'+field&&e.cause?.rule==='instant_or_null');}
 const r=request(count);Object.assign(r.readTicket.temporal,{from:'2024-12-31T00:00:00-08:00',to:'2025-01-02T00:00:00-08:00'});
 assert.deepEqual(accepts(r).request.readTicket.temporal,r.readTicket.temporal);
});
test('calendar-day Brain contract distinguishes ticket instants from legacy dates',()=>{
 for(const term of ['complete ISO instant with time and Z or an explicit numeric offset','never a date-only value','inclusive start is local midnight on the start day','next local midnight in the supplied timezone','offset applicable at each boundary','Legacy outer from/to (not readTicket.temporal.from/to)'])assert.ok(ASK_REQUEST_INSTRUCTIONS.includes(term),term);
});
test('Brain-resolved calendar bounds preserve next-local-midnight semantics without conversion',async()=>{
 const {calendarDateInZone,calendarBoundaryToInstant}=await import('../app/lib/ask-time-zone.ts');
 for(const [zone,from,to,lastDay,nextDay] of [
  ['America/Los_Angeles','2024-12-31T00:00:00-08:00','2025-01-02T00:00:00-08:00','2025-01-01','2025-01-02'],
  ['America/Los_Angeles','2024-03-10T00:00:00-08:00','2024-03-11T00:00:00-07:00','2024-03-10','2024-03-11'],
 ]){const r=request();Object.assign(r.readTicket.temporal,{from,to});assert.equal(check({request:r}),true);
  const bound=validateAskRequest(r,{...context,timeZone:zone}).request.readTicket;
  assert.equal(bound.temporal.from,from);assert.equal(bound.temporal.to,to);
  assert.equal(Date.parse(to),Date.parse(calendarBoundaryToInstant(nextDay+'T00:00:00.000Z',zone)));
  assert.equal(calendarDateInZone(new Date(Date.parse(to)-1).toISOString(),zone),lastDay);
  assert.equal(calendarDateInZone(to,zone),nextDay);
 }
});

import {CALCULATION_INPUT_OWNERSHIP,DIRECT_CALCULATION_OPERAND_DESCRIPTION,RESULT_CALCULATION_OPERAND_DESCRIPTION,requiresCalculateBinding,rebindCalculatePlan} from '../app/lib/furvise-brain/calculate-plan.ts';
// Contract structure tests, not model compliance. Binder alone verifies dynamic sibling identity.
test('source-domain meaning is stated once; provider operands retain their closed authority fields',()=>{
 for(const term of ['certified factual ReadTicket slots', 'exact USER premise spans', 'Recorded operands are only target/reference signed difference over stored_report, never certified facts','EARLIER arithmetic node','actual prior producer id','ReadTicket slots and USER spans are not calculation IDs'])assert.ok(CALCULATION_INPUT_OWNERSHIP.includes(term),term);
 assert.ok(ASK_REQUEST_INSTRUCTIONS.includes(CALCULATION_INPUT_OWNERSHIP));
 assert.ok(DIRECT_CALCULATION_OPERAND_DESCRIPTION.includes('selected by ReadTicket'));
 assert.ok(RESULT_CALCULATION_OPERAND_DESCRIPTION.includes('No implicit producer exists'));
 // This actual context has no current USER numeric premise: that branch is unavailable.
 assert.equal(schema.properties.request.anyOf.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('supplied_context')).length,0);
 assertOperandContracts(schema,['anchor','read','recorded','result']);
});
test('provider array branches use existing keywords without new plan fields or tuple/conditional tricks',()=>{
 for(const branch of schema.properties.request.anyOf.filter(v=>v.properties.version?.enum?.[0]==='ask-request.v2' && v.properties.calculatePlan?.type==='object')){
  const p=branch.properties.calculatePlan;
  assert.deepEqual(Object.keys(p.properties).sort(),['calculations','operation','resultSelection']);
  const arrays=p.properties.calculations.anyOf;
  if(!arrays)continue;
  assert.equal(arrays.length,2);assert.equal(arrays[0].minItems,1);assert.equal(arrays[1].minItems,2);
  assert.equal(arrays[0].maxItems,20);assert.equal(arrays[1].maxItems,20);
  const rootField=branch.properties.evidenceBasis.enum[0]==='saved_history'?'petName':'quote';
  assert.ok(arrays[0].items.anyOf.every(n=>rootField in n.properties.operands.items.properties));
  assert.ok(arrays[1].items.anyOf.some(n=>'calculationId' in n.properties.operands.items.properties));
 }
 const visit=n=>{if(!n||typeof n!=='object')return;for(const key of ['prefixItems','additionalItems','contains','if','then','else','allOf','not','$data'])assert.equal(Object.hasOwn(n,key),false,key);Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(visit):visit(v));};visit(schema);
});
for(const operator of measurementOperators)test('single direct '+operator+' remains canonical and binds without result aliases',()=>{
 const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;c.operands=(operator==='convert'?[0]:[0,1]).map(i=>operand(i));
 c.resultUnit=operator==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(operator)?'%':'kg';assignFixtureRoles(c);
 const bound=accepts(r).request.calculatePlan;assert.equal(bound.calculations.length,1);
 assert.ok(bound.calculations[0].operands.every(o=>!('kind' in o)&&o.subjectId===pets[0].id));
});
test('single direct event calculation remains provider-valid',()=>{assert.equal(accepts(elapsedRequest()).request.calculatePlan.calculations[0].operator,'elapsed_days');});
for(const operator of measurementOperators)test('provider excludes single-node result-only '+operator+' plans',()=>{
 const r=request(),c=r.calculatePlan.calculations[0];Object.assign(c,calculation(operator,Array.from({length:operator==='convert'?1:2},()=>({kind:'result',calculationId:'undeclared'})),operator==='convert'?'g':operator==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(operator)?'%':'kg'));
 assert.equal(check({request:r}),false);
 assert.throws(()=>validateAskRequest(r,context),/ASK_CALCULATE_INVALID:backward_reference/);
});
test('multiple independent direct nodes remain accepted without a ceremonial DAG',()=>{
 const r=request();r.calculatePlan.calculations.push({...structuredClone(r.calculatePlan.calculations[0]),id:'second'});
 assert.equal(accepts(r).request.calculatePlan.calculations.length,2);
});
test('actual multi-node derived computation and repeated backward references remain legal',()=>{
 const r=request();r.calculatePlan.calculations.push({...structuredClone(r.calculatePlan.calculations[0]),id:'second'});
 r.calculatePlan.calculations.push(calculation('mean',[{kind:'result',calculationId:'c1'},{kind:'result',calculationId:'second'},{kind:'result',calculationId:'c1'}],'kg','terminal'));
 const p=accepts(r).request.calculatePlan;
 assert.deepEqual(p.calculations[2].operands.map(o=>[o.role,o.calculationId]),[['member','c1'],['member','second'],['member','c1']]);
});
for(const [label,id] of [['unknown','undeclared'],['self','derived'],['forward','future']])test('schema cannot prove '+label+' sibling identity; Binder rejects it',()=>{
 const r=dag();r.calculatePlan.calculations[1].operands[0].calculationId=id;
 if(label==='forward')r.calculatePlan.calculations.push({...structuredClone(r.calculatePlan.calculations[0]),id:'future'});
 assert.equal(check({request:r}),true,JSON.stringify(check.errors));
 assert.throws(()=>validateAskRequest(r,context),/ASK_CALCULATE_INVALID:backward_reference/);
});
test('multi-node minimum cannot guarantee a preceding producer; first derived node still fails Binder',()=>{
 const r=dag();r.calculatePlan.calculations.reverse();
 assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/backward_reference/);
});
for(const make of [request,dag])test('ownership shape, roles and every-plan trusted snapshots remain authoritative '+make.name,()=>{
 const r=make(),bound=accepts(r).request,p=bound.calculatePlan,t=bound.readTicket,copy=structuredClone(p);
 assert.equal(requiresCalculateBinding(p),true);assert.deepEqual(rebindCalculatePlan(copy,t,p),p);
 assert.throws(()=>rebindCalculatePlan(copy,t),/binding_snapshot/);
 copy.calculations[0].operands[0].role='reference';assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);
 const changed=structuredClone(p);changed.calculations[0].operands=[{kind:'result',role:'target',calculationId:'undeclared'},{kind:'result',role:'reference',calculationId:'undeclared'}];
 assert.throws(()=>rebindCalculatePlan(changed,t,p),/binding_snapshot/);
});

test("catalog intent remains a separate source-free provider branch",()=>{const branches=askRequestProviderSchema({}).properties.request.anyOf;const catalog=branches.filter(v=>v.properties.version?.enum?.[0]==="ask-catalog-intent.v1");assert.equal(catalog.length,1);assert.ok(catalog[0].properties.request);assert.equal(catalog[0].properties.calculatePlan,undefined);});
