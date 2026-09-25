import Ajv from 'ajv';
import {assert,test,bindCalculatePlan,pets,rawTicket,slot,calculation,envelope,askRequestProviderSchema,validateAskRequest} from './helpers/calculation-fixture.mjs';
const context={owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:'Calculate from saved observations.',conversationTurns:[],currentTurn:{id:'source',role:'user',text:'Calculate from saved observations.'},timeZone:'UTC'};
const schema=askRequestProviderSchema({type:'object',additionalProperties:false,required:[],properties:{}},context),check=new Ajv({allErrors:true}).compile(schema);
const operand=(...a)=>({...slot(...a),measurementSelector:null});
const request=(count=false)=>{const ticket={...rawTicket(count),subjectScope:'named',episode:null,searchHints:[],probes:[]};ticket.temporal.calendar=null;if(count)ticket.outputs.strategy=null;return {...envelope({operation:'calculate',resultSelection:null,calculations:[count?calculation('count_records',[],'records'):calculation('difference',[operand(1),operand(0)])]},ticket),outputFormat:null,temporalScope:'historical',profileFields:[],evidenceNeeds:[],excludedPetNames:[],mutationIntent:null,projection:null,recordSelection:null,task:null,storedRead:null,appendJob:null,writeJob:null,removeJob:null,fieldMutationJob:null,stateTransitionJob:null,lifecyclePlan:null};};
const accepts=r=>{assert.equal(check({request:r}),true,JSON.stringify(check.errors));return validateAskRequest(structuredClone(r),context);};
const rejects=r=>{assert.equal(check({request:r}),false);assert.throws(()=>validateAskRequest(structuredClone(r),context));};
for(const operator of ['sum','mean','difference','absolute_difference','ratio','percent_change','percent_of_sum','convert','elapsed_days'])test(operator+' cannot reference read slots without selection',()=>{const r=request();r.calculatePlan.calculations[0].operator=operator;r.readTicket.selection=null;rejects(r);});
for(const operator of ['difference','mean','convert','elapsed_days'])test(operator+' with a legal selection passes schema and Binder',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;if(operator==='convert')c.operands=[operand(0)];if(operator==='elapsed_days'){c.operands=[operand(0,0,pets[0].name,'event_at',null),operand(1,0,pets[0].name,'event_at',null)];c.resultUnit='day';}assert.equal(accepts(r).request.calculatePlan.calculations[0].operator,operator);});
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
for(const count of [false,true])for(const [name,edit]of [['episode',r=>r.readTicket.episode={operation:'count',referent:{}}],['needs',r=>r.readTicket.needs=[{}]],['probes',r=>r.readTicket.probes=[{}]],['strategy',r=>r.readTicket.outputs.strategy='chronological'],['calendar',r=>r.readTicket.temporal.calendar='oldest_year'],['compare',r=>r.readTicket.operation='compare'],['rank',r=>r.readTicket.operation='rank']])test((count?'count':'selected')+' calculation rejects '+name,()=>{const r=request(count);edit(r);if(count&&name==='strategy'){assert.equal(check({request:r}),false);assert.throws(()=>bindCalculatePlan(r.calculatePlan,{...r.readTicket,subjects:{petIds:[pets[0].id]}},pets),/read_domain/);}else rejects(r);});
for(const count of [false,true])test((count?'count':'selected')+' calculation preserves semantic anchors',()=>{const r=request(count);r.readTicket.operation='read_since_event';r.readTicket.temporal.anchor={concept:'procedure',relation:'after'};assert.equal(accepts(r).request.readTicket.operation,'read_since_event');});
test('selected calculations retain exhaustive reads and global transport caps',()=>{const r=request();r.readTicket.outputs.completeness='exhaustive';r.readTicket.outputs.limit=3;accepts(r);});
test('provider schemas remain closed and fully required without conditional keywords',()=>{const visit=n=>{if(!n||typeof n!=='object')return;for(const k of ['if','then','oneOf'])assert.equal(Object.hasOwn(n,k),false);if(n.properties){assert.equal(n.additionalProperties,false);assert.deepEqual([...n.required].sort(),Object.keys(n.properties).sort());}for(const v of Object.values(n))Array.isArray(v)?v.forEach(visit):visit(v);};visit(schema);});

const measurementOperators=['sum','mean','difference','absolute_difference','ratio','percent_change','percent_of_sum','convert'];
for(const operator of measurementOperators)test(operator+' provider rejects null measurement unit',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;if(operator==='convert')c.operands=[operand(0)];c.operands[0].unit=null;rejects(r);});
for(const operator of measurementOperators)test(operator+' provider rejects event-time operands',()=>{const r=request(),c=r.calculatePlan.calculations[0];c.operator=operator;c.operands=(operator==='convert'?[0]:[0,1]).map(i=>operand(i,0,pets[0].name,'event_at',null));rejects(r);});
const elapsedRequest=()=>{const r=request();Object.assign(r.calculatePlan.calculations[0],{operator:'elapsed_days',operands:[0,1].map(i=>operand(i,0,pets[0].name,'event_at',null)),resultUnit:'day'});return r;};
for(const [name,edit] of [['non-null unit',r=>r.calculatePlan.calculations[0].operands[0].unit='day'],['selector',r=>r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[0]}],['measurement field',r=>r.calculatePlan.calculations[0].operands[0]=operand(0)]])test('elapsed provider rejects '+name,()=>{const r=elapsedRequest();edit(r);rejects(r);});
test('elapsed event-time operands bind with null unit and selector',()=>{accepts(elapsedRequest());});
test('all registry units remain available for explicit measurement slots',async()=>{const {units}=await import('../app/lib/furvise-brain/calculation-units.ts');for(const unit of Object.keys(units)){const r=request(),c=r.calculatePlan.calculations[0];c.operands.forEach(o=>o.unit=unit);c.resultUnit=unit;accepts(r);}});
for(const operator of measurementOperators)test('derived '+operator+' retains result-only operand authority',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator=operator;c.operands=Array(operator==='convert'?1:2).fill(null).map(()=>({kind:'result',calculationId:'c1'}));c.resultUnit=operator==='convert'?'g':operator==='ratio'?'scalar':['percent_change','percent_of_sum'].includes(operator)?'%':'kg';accepts(r);});
test('derived elapsed remains rejected by provider and Binder',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator='elapsed_days';c.operands=[{kind:'result',calculationId:'c1'},{kind:'result',calculationId:'c1'}];c.resultUnit='day';rejects(r);});
test('provider rejects mixed direct and result operands',()=>{const r=dag(),c=r.calculatePlan.calculations[1];c.operator='sum';c.resultUnit='kg';c.operands.push(operand(0));rejects(r);});
test('measurement selector identity remains Binder-owned',()=>{const r=request();r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[5]};assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context),/measurement_selector/);});
test('valid measurement selector structure preserves binding',()=>{const r=request();r.readTicket.predicates=[{kind:'text_any',terms:['sample']}];r.calculatePlan.calculations[0].operands[0].measurementSelector={predicateIndexes:[0]};accepts(r);});

import {ASK_REQUEST_INSTRUCTIONS} from '../app/lib/intelligence/ask-request-contract.ts';
// Contract descriptions are checked here, not live model compliance.
const roleChecks=[
 ['difference',['operand 0 is the target/minuend','operand 1 is the reference/subtrahend','operand 0 - operand 1']],
 ['percent_change',['operand 0 is the baseline/reference','operand 1 is the new/target','(operand 1 - operand 0) / operand 0 * 100','differs from difference']],
 ['ratio',['operand 0 is the denominator/reference','operand 1 is the numerator/comparison','operand 1 / operand 0']],
 ['elapsed_days',['operand 0 is the start event','operand 1 is the end event','event 1 - event 0']],
 ['percent_of_sum',['operand 0 is the requested part/numerator','including operand 0','operand 0 / sum(all operands) * 100']],
 ['absolute_difference',['exactly two operands','abs(operand 0 - operand 1)','order-insensitive']],
 ['sum',['one or more operands','order-insensitive','sum(all operands)']],
 ['mean',['one or more operands','order-insensitive','operand count']],
 ['convert',['one source operand only','resultUnit']],
 ['count_records',['no operands','certified effective record count']],
];
const providerNodes=schema.properties.request.anyOf.filter(v=>v.properties.calculatePlan.type==='object').flatMap(v=>{
 const items=v.properties.calculatePlan.properties.calculations.items;return items.anyOf||[items];
});
for(const [operator,terms] of roleChecks)test(operator+' semantic roles are explicit in instructions and each provider operand branch',()=>{
 const line=ASK_REQUEST_INSTRUCTIONS.split('\n').find(s=>s.startsWith(operator+':'));assert.ok(line,operator);
 const nodes=providerNodes.filter(n=>n.properties.operator.enum.includes(operator));assert.ok(nodes.length);
 for(const term of terms){assert.ok(line.includes(term),term);for(const node of nodes)for(const field of ['operator','operands'])assert.ok(node.properties[field].description.includes(term),operator+' '+field+' '+term);}
});
test('selection addresses do not assign arithmetic roles for read or derived operands',()=>{
 for(const text of [ASK_REQUEST_INSTRUCTIONS,...providerNodes.flatMap(n=>[n.description,n.properties.operands.description])]){
  for(const term of ['Selection order is not calculation operand order','clause/item addresses','upstream result operands','do not assume binary operators share'])assert.ok(text.includes(term),term);
 }
});
