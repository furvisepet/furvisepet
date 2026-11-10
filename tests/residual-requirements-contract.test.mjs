import test from 'node:test';
import assert from 'node:assert/strict';
import {ASK_REQUEST_INSTRUCTIONS,validateAskRequest,askRequestSchema} from '../app/lib/intelligence/ask-request-contract.ts';
const pet={id:'owned',name:'Aster',user_id:'owner',species:'dog'};
const ticket={operation:'read',subjectScope:'named',temporal:{from:'2026-01-01T00:00:00Z',to:'2026-01-02T00:00:00Z',anchor:null,calendar:null},predicates:[],outputs:{strategy:null,completeness:'sufficient',ordering:'asc',limit:null},selection:null,needs:[],episode:null,searchHints:null};
const base=q=>({version:'ask-request.v2',mode:'read',question:q,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[],evidenceBasis:'saved_history',readTicket:structuredClone(ticket)});
const latest={...ticket,outputs:{completeness:'sufficient',ordering:'asc',limit:null},selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
const context=q=>({owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:q,currentTurn:{id:'turn',role:'user',text:q,createdAt:'2026-01-03T00:00:00Z'},conversationTurns:[],timeZone:'UTC'});
const cases=[['ordinary measurement','Read the recorded temperature for Aster.',{quantity:'measurement'}],['textual record','Read the travel observation for Aster.',{}],['latest record','Read the latest observation for Aster.',{readTicket:latest}],['calculation','Count the saved observations for Aster.',{calculatePlan:{operation:'calculate',calculations:[{id:'c1',operator:'count_records',operands:[],resultUnit:'records',precision:null}]},readTicket:{...ticket,outputs:{strategy:null,completeness:'exhaustive',ordering:'asc',limit:null}},quantity:'records'}],['profile read',"Read Aster's saved species.",{evidenceBasis:'saved_profile',readTicket:null,profileFields:['species'],quantity:null,temporalScope:'current'}],['canonical write','Replace the last note for Aster with: Rested quietly.',{mode:'update',readTicket:null,evidenceBasis:null,quantity:null,operation:'general',selection:'latest',task:null,mutationIntent:'correct_record',writeJob:{operation:'replace',target:'last_event_for_subject',petName:'Aster',instructionQuote:'Replace the last note for Aster with: Rested quietly.',bodyQuote:'Rested quietly.',constraints:[]}}]];
// These are explicit provider-contract fixtures, not evidence of live model compliance.
for(const[name,q,patch]of cases)test('fully represented '+name+' binds empty residual requirements',()=>{const result=validateAskRequest({...base(q),...structuredClone(patch)},context(q));assert.deepEqual(result.request.requirements,[]);});
test('genuinely additional user-facing work stays residual without changing the ticket',()=>{const q='Read the observation for Aster and explain its clinical implications.';const p=base(q);p.requirements=['Explain the clinical implications.'];const bound=validateAskRequest(p,context(q));assert.deepEqual(bound.request.requirements,p.requirements);assert.deepEqual(bound.request.readTicket.predicates,[]);});
test('provider instructions define residual-only obligations across typed domains',()=>{for(const term of ['residual user-facing obligations','Use [] when typed fields fully represent the task','ReadTicket lookup','CalculatePlan arithmetic','selection/group/order/take','projection, outputFormat, task, mutation job, profile read, StoredRead'])assert.ok(ASK_REQUEST_INSTRUCTIONS.includes(term),term);assert.doesNotMatch(ASK_REQUEST_INSTRUCTIONS,/requirements lists the requested answer obligations, including format/);assert.match(askRequestSchema({}).properties.requirements.description,/Residual user-facing obligations only/);});

import {askRequestProviderSchema} from '../app/lib/intelligence/ask-request-contract.ts';
import {CALCULATE_OPERATORS} from '../app/lib/furvise-brain/calculate-plan.ts';
import {historyTaskCompleted,reviewObligationCompletion} from '../app/lib/intelligence/history-obligations.ts';
// These checks prove semantic contract structure and fail-closed binding, not model compliance.
test('supported derivation ownership is mandatory for the complete operator registry',()=>{
 const ownership=ASK_REQUEST_INSTRUCTIONS.split('\n').find(line=>line.startsWith('Every requested deterministic derivation'));
 assert.ok(ownership);for(const operator of CALCULATE_OPERATORS)assert.ok(ownership.includes(operator),operator);
 assert.match(ownership,/must be represented in calculatePlan/);assert.match(ownership,/Do not place such a derivation in requirements/);
 assert.match(ownership,/no existing typed execution primitive owns/);
});
test('provider branches distinguish calculation ownership without classifying language',()=>{
 const variants=askRequestProviderSchema({}).properties.request.anyOf;
 const calculations=variants.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('saved_history'));
 assert.equal(calculations.length,2);for(const v of calculations)assert.match(v.description,/Saved-history calculation: factual root operands come from the companion ReadTicket/);
 const supplied=variants.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('supplied_context'));
 assert.equal(supplied.length,1);assert.match(supplied[0].description,/exact USER-supplied numeric premises/);
 const reads=variants.filter(v=>v.properties.mode?.enum?.includes('read')&&v.properties.calculatePlan?.type==='null'&&v.properties.evidenceBasis.enum?.includes('saved_history'));
 assert.equal(reads.length,2);for(const v of reads){assert.match(v.description,/requires no supported deterministic arithmetic or derivation/);assert.equal(v.properties.requirements.maxItems,8);}
});
test('requirements describe non-executable residual work with no factual authority',()=>{
 const d=askRequestSchema({}).properties.requirements.description;
 for(const term of ['NON-EXECUTABLE','unsupported companion analysis','CalculatePlan work','selection','profile lookup','StoredRead','mutation','no source authority','cannot trigger arithmetic'])assert.ok(d.includes(term),term);
 assert.match(ASK_REQUEST_INSTRUCTIONS,/A factual comparison or measurement read alone does not imply arithmetic/);
});
for(const operator of CALCULATE_OPERATORS)test('residual '+operator+' text cannot cause Binder to invent arithmetic',()=>{
 const q='Read the saved observations for Aster.';const p={...base(q),calculatePlan:null,requirements:['Apply '+operator+' to the retrieved facts.']};
 const bound=validateAskRequest(p,context(q));assert.equal(bound.request.calculatePlan??null,null);assert.deepEqual(bound.request.requirements,p.requirements);
});
test('residual completion cannot borrow factual sources or count limited work as complete',()=>{
 const obligations=[{index:1,kind:'residual_requirement',text:'Unsupported companion analysis.',representedSourceIds:[]}];
 const review=reviewObligationCompletion(obligations,[{index:1,status:'limited',sentenceIndexes:[0]}],[{sourceIds:['fact']}],[{sourceId:'fact',petId:'owned'}]);
 assert.deepEqual(review.completion[0].sourceIds,[]);assert.equal(historyTaskCompleted([{index:0,status:'answered'},...review.completion]),false);
});
