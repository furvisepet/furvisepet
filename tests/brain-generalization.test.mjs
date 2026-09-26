import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import Ajv from 'ajv';
import {corpus,knownGaps,unmeasured,families} from './fixtures/brain-generalization-corpus.mjs';
import {fixture,context,pets,clause,operand,calculation} from './helpers/brain-generalization-fixture.mjs';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('BRAIN_GENERALIZATION_OFFLINE_ONLY');};
const {validateAskRequest,askRequestProviderSchema,ASK_REQUEST_INSTRUCTIONS}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {CALCULATION_SLOT_ADDRESSING}=await import('../app/lib/furvise-brain/calculate-plan.ts');
const frame={type:'object',additionalProperties:false,properties:{},required:[]};
const schema=askRequestProviderSchema(frame,context('Semantic fixture.'));
const check=new Ajv({allErrors:true}).compile(schema);
const byFamily=name=>corpus.find(e=>e.family===name);
const bind=p=>validateAskRequest(structuredClone(p.proposal),p.context);

// This measures contract representation, NOT language-model accuracy.
for(const entry of corpus)test('typed oracle: '+entry.id,()=>{
  const f=fixture(entry);
  assert.equal(check({request:f.proposal}),true,JSON.stringify(check.errors?.slice(-5)));
  const result=bind(f),r=result.request;
  assert.ok(r);assert.equal(result.clarification,null);
  assert.equal(r.mode,f.proposal.mode);
  if(f.proposal.readTicket){
    assert.deepEqual(r.readTicket.temporal,f.proposal.readTicket.temporal);
    assert.deepEqual(r.readTicket.predicates,f.proposal.readTicket.predicates);
    assert.deepEqual(r.readTicket.selection??null,f.proposal.readTicket.selection);
    assert.deepEqual(r.readTicket.subjects.petIds,f.proposal.petNames.map(n=>pets.find(p=>p.name===n).id));
  }
  if(f.proposal.calculatePlan){
    assert.deepEqual(r.calculatePlan.calculations.map(c=>[c.id,c.operator,c.resultUnit,c.operands.map(o=>o.role)]),f.proposal.calculatePlan.calculations.map(c=>[c.id,c.operator,c.resultUnit,c.operands.map(o=>o.role)]));
    assert.deepEqual(r.calculatePlan.resultSelection,f.proposal.calculatePlan.resultSelection);
  }
  if(entry.family==='profile')assert.deepEqual(r.profileFields,['weight']);
  if(entry.family==='memory')assert.deepEqual(r.storedRead.subjectIds,[pets[0].id]);
  if(entry.family==='followup')assert.deepEqual(r.referenceTurnIds,['prior-user']);
  if(r.appendJob){assert.equal(r.appendJob.petId,pets[0].id);assert.equal(r.appendJob.items[0].body.text,'Ate slowly and left half the meal.');}
  if(r.writeJob)assert.equal(r.writeJob.body.text,'Ate the whole meal, not half.');
  if(r.removeJob)assert.equal(r.removeJob.petId,pets[0].id);
  if(r.fieldMutationJob)assert.deepEqual(r.fieldMutationJob.value,{kind:'weight',value:7.25,unit:'kg'});
  if(r.lifecyclePlan)assert.deepEqual([r.lifecyclePlan.transition.petId,r.lifecyclePlan.transition.toState],[pets[0].id,'archived']);
  if(r.stateTransitionJob)assert.deepEqual([r.stateTransitionJob.petId,r.stateTransitionJob.toState],[pets[0].id,'resolved']);
  if(entry.family==='append_mixed'){assert.deepEqual(result.petIds,[pets[0].id]);assert.deepEqual(result.readPetIds,[pets[1].id]);}
});

test('three subjects share one clause/item; ranking intent survives binding',()=>{
  const f=fixture(byFamily('ranking')),r=bind(f).request;
  assert.equal(r.readTicket.selection.union.length,1);
  assert.deepEqual(r.calculatePlan.calculations.map(c=>[c.operands[0].subjectId,c.operands[0].clause,c.operands[0].item]),pets.map(p=>[p.id,0,0]));
  assert.deepEqual(r.calculatePlan.resultSelection,{filter:null,orderBy:{direction:'desc'},take:null});
});
test('two subjects independently address both existing clauses',()=>{
  const f=fixture(byFamily('difference'));f.proposal.petNames=pets.slice(0,2).map(p=>p.name);f.proposal.calculatePlan.calculations=calculation('difference',f.proposal.petNames);
  assert.equal(check({request:f.proposal}),true);
  assert.deepEqual(bind(f).request.calculatePlan.calculations.map(c=>c.operands.map(o=>[o.subjectId,o.clause,o.item])),pets.slice(0,2).map(p=>[[p.id,0,0],[p.id,1,0]]));
});
test('item is local to a subject and clause, including multiple occurrences',()=>{
  const f=fixture(byFamily('mean'));f.proposal.readTicket.selection.union=[clause('desc',3)];
  f.proposal.calculatePlan.calculations[0].operands=[0,1,2].map(i=>operand('Aster',0,i));
  assert.equal(check({request:f.proposal}),true);assert.deepEqual(bind(f).request.calculatePlan.calculations[0].operands.map(o=>o.item),[0,1,2]);
});
for(const [subject,clauseIndex]of [[1,1],[2,2]])test('nonexistent grouped clause remains rejected for subject '+subject,()=>{
  const f=fixture(byFamily('ranking'));f.proposal.calculatePlan.calculations[subject].operands[0].clause=clauseIndex;
  assert.equal(check({request:f.proposal}),true,'dynamic sibling bounds belong to Binder');
  assert.throws(()=>bind(f),/ASK_CALCULATE_INVALID:position/);
});
for(const coordinate of ['clause','item'])test('negative/fractional/out-of-range '+coordinate+' is rejected',()=>{
  for(const value of [-1,0.5,100]){const f=fixture(byFamily('convert'));f.proposal.calculatePlan.calculations[0].operands[0][coordinate]=value;assert.throws(()=>bind(f),/position/);}
});
test('foreign ownership cannot be widened by a legal schema',()=>{
  for(const family of ['grouped','ranking','profile','memory','append','replace','remove','profile_mutation','lifecycle','state_transition']){
    const f=fixture(byFamily(family));f.context.eligiblePets=f.context.eligiblePets.map(p=>({...p,user_id:'other-owner'}));
    let r;try{r=bind(f);}catch{continue;}
    assert.ok(r.clarification||!r.petIds.length,family);assert.equal(r.readOnly,true,family);
  }
});
test('assistant-only references cannot supply owned conversation scope',()=>{
  const f=fixture(byFamily('followup'));f.context.conversationTurns[0].role='furvise';
  let result;try{result=bind(f);}catch{return;}
  assert.ok(result.clarification||!result.request?.readTicket);
});
test('mutation value must remain an exact current USER source span',()=>{
  for(const family of ['append','replace','profile_mutation','lifecycle','state_transition']){
    const f=fixture(byFamily(family));f.context.currentTurn={...f.context.currentTurn,role:'furvise'};assert.throws(()=>bind(f),/ASK_REQUEST_INVALID/);
  }
});
test('descriptions clarify coordinates in the actual emitted provider branches',()=>{
  assert.ok(ASK_REQUEST_INSTRUCTIONS.includes(CALCULATION_SLOT_ADDRESSING));
  let direct=0;
  const visit=n=>{if(!n||typeof n!=='object')return;
    if(n.properties?.petName&&n.properties?.clause&&n.properties?.item){direct++;assert.match(n.description,/three independent coordinates/);assert.match(n.properties.clause.description,/never a subject index/);assert.match(n.properties.item.description,/within this subject and clause/);}
    for(const v of Object.values(n))Array.isArray(v)?v.forEach(visit):visit(v);
  };visit(schema);assert.ok(direct>0);
});
test('corpus includes every family without calling a provider or treating gaps as passes',()=>{
  assert.equal(new Set(corpus.map(e=>e.id)).size,corpus.length);assert.equal(corpus.length,families.length*4);
  assert.equal(knownGaps.length,32);assert.ok(knownGaps.every(e=>e.oracleKind==='semantic_gap'));
  assert.equal(unmeasured.length,4);assert.ok(unmeasured.every(e=>e.oracleKind==='requires_model_evaluation'));
});

const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
for(const [family]of families)test('single mocked interpretation transports oracle: '+family,async()=>{
  const f=fixture(byFamily(family));let calls=0;
  const result=await interpretAskQuestion({context:f.context,model:'offline-fixture',client:{responses:{create:async request=>{
    calls++;assert.equal(calls,1,'no fixture repair or retry');
    assert.ok(request.instructions.includes(CALCULATION_SLOT_ADDRESSING));
    return {output_text:JSON.stringify(f.proposal)};
  }}}});
  assert.equal(calls,1);assert.equal(result.request.mode,f.proposal.mode);
  assert.deepEqual(result.petIds,bind(f).petIds);
});

test('typed user-premise arithmetic is a recorded gap, not coerced into saved history',()=>{
  const f=fixture(byFamily('sum'));Object.assign(f.proposal,{mode:'conversation',scope:'none',petNames:[],evidenceBasis:'supplied_context',readTicket:null,premiseQuotes:['3 kg and 4 kg']});
  f.context.currentMessage='Use only 3 kg and 4 kg; add them.';f.context.currentTurn.text=f.context.currentMessage;
  assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/calculate_scope/);
});
test('unsupported mixed mutation/calculation cannot bind a partial operation',()=>{
  const f=fixture(byFamily('difference'));f.proposal.appendJob=fixture(byFamily('append')).proposal.appendJob;f.proposal.mode='mixed';
  assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/calculate_scope/);
});
test('union clauses cannot invent predicate/window fields absent from the vocabulary',()=>{
  for(const patch of [{predicates:[]},{temporal:{from:null,to:null}}]){
    const f=fixture(byFamily('latest'));Object.assign(f.proposal.readTicket.selection.union[0],patch);
    assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/ASK_REQUEST_INVALID/);
  }
});
test('unsupported grouping dimensions and predicate kinds are explicit gaps',()=>{
  for(const dimension of ['month','measurement']){const f=fixture(byFamily('grouped'));f.proposal.readTicket.selection.groupBy=[dimension];assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/ASK_REQUEST_INVALID/);}
  const f=fixture(byFamily('exact'));f.proposal.readTicket.predicates=[{kind:'numeric_gt',value:8,unit:'kg'}];assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/ASK_REQUEST_INVALID/);
});
test('relative append dates and repeated quote occurrences remain unresolved, not guessed',()=>{
  const f=fixture(byFamily('append'));f.context.currentMessage='Yesterday: Ate slowly and left half the meal.';f.context.currentTurn.text=f.context.currentMessage;
  Object.assign(f.proposal.appendJob.items[0],{bodyQuote:f.context.currentMessage,dateQuote:'Yesterday',occurredAt:'2035-05-31T00:00:00Z'});
  assert.throws(()=>bind(f),/append_date/);
  const repeated=fixture(byFamily('append'));repeated.context.currentMessage+=' Ate slowly and left half the meal.';repeated.context.currentTurn.text=repeated.context.currentMessage;
  assert.throws(()=>bind(repeated),/append_span/);
});
test('profile clear and unsupported fields are not silently translated into set_field',()=>{
  for(const patch of [{operation:'clear_field',valueQuote:null},{field:'birth_date',valueQuote:'2020-02-29'}]){
    const f=fixture(byFamily('profile_mutation'));Object.assign(f.proposal.fieldMutationJob,patch);assert.equal(check({request:f.proposal}),false);assert.throws(()=>bind(f),/ASK_REQUEST_INVALID/);
  }
});
