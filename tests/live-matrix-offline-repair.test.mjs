import Ajv from 'ajv';
import {assert,test,validateAskRequest,askRequestProviderSchema,rawTicket,slot,calculation,envelope,pets} from './helpers/calculation-public-fixture.mjs';
import {currentUserNumericQuotes} from '../app/lib/intelligence/calculation-premise-schema.ts';
import {ASK_REQUEST_INSTRUCTIONS} from '../app/lib/intelligence/ask-request-contract.ts';
import {publicV1AskCapability} from '../app/lib/public-v1-capabilities.ts';
import {sourceSemanticsSchema,readWriteSourceSemantics} from '../app/lib/furvise-brain/source-semantics.ts';
import {appendJobSchema} from '../app/lib/furvise-brain/append-job.ts';
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const context=text=>({owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:text,currentTurn:{id:'current',role:'user',text},conversationTurns:[],timeZone:'UTC'});
const complete=(plan,ticket,text)=>({...envelope(plan,ticket),question:text,outputFormat:null,temporalScope:null,
 profileFields:[],evidenceNeeds:[],excludedPetNames:[],mutationIntent:null,projection:null,recordSelection:null,task:null,
 storedRead:null,appendJob:null,writeJob:null,removeJob:null,fieldMutationJob:null,stateTransitionJob:null,lifecyclePlan:null});
const node=(id,operator,operands,resultUnit)=>({id,operator,operands,resultUnit,precision:null});
const premise=(quote,role,unit='scalar')=>({kind:'premise',role,sourceTurnId:null,quote,unit});
const plan=calculations=>({operation:'calculate',resultSelection:null,calculations});
const supplied=(text,a='9',b='7',unit='scalar')=>({...complete(plan([node('root','difference',[premise(a,'target',unit),premise(b,'reference',unit)],unit)]),null,text),
 evidenceBasis:'supplied_context',scope:'none',petNames:[],premiseQuotes:[a,b]});
const checkFor=c=>new Ajv({strict:false}).compile(askRequestProviderSchema({},c));

for(const [text,a,b,unit] of [
 ['Δ fictional amounts: −3.25 kg and 250 g.','−3.25 kg','250 g','kg'],
 ['A sample duration has +8 hours versus 30 min.','+8 hours','30 min','hour'],
 ['Suppose 1.5 l and 250 ml.','1.5 l','250 ml','l'],
 ['A made-up distance: 14 cm versus 0.02 m.','14 cm','0.02 m','cm'],
 ['Explicit fictional prices: 4 CAD versus 2 cad.','4 CAD','2 cad','cad'],
 ['Scalar operands 9 and 7.','9','7','scalar'],
 ['😀 amounts 2\u00a0kg versus 800 g.','2\u00a0kg','800 g','kg'],
])for(const reverse of [false,true])test('current USER exact vocabulary '+text+'/'+reverse,()=>{
 const c=context(text),r=supplied(text,a,b,unit);
 if(reverse)r.calculatePlan.calculations[0].operands.reverse();
 assert.equal(checkFor(c)({request:r}),true);
 const bound=validateAskRequest(structuredClone(r),c).request;
 assert.ok(bound.calculatePlan.calculations[0].operands.every(o=>o.source.sourceMessageId==='current'));
 assert.deepEqual(bound.calculatePlan,validateAskRequest(JSON.parse(JSON.stringify(r)),c).request.calculatePlan);
 assert.equal(publicV1AskCapability(bound).available,false,'Public execution policy stays disabled');
});

for(const text of ['Read Juniper’s latest dose.','Find Quartz’s saved exercise duration.','Compare the logged meal amount for Fern and Sol.'])test('no numeric USER span means no supplied calculation branch: '+text,()=>{
 const c=context(text),schema=askRequestProviderSchema({},c);
 assert.equal(schema.properties.request.anyOf.some(v=>v.properties.evidenceBasis?.enum?.[0]==='supplied_context'&&v.properties.calculatePlan.type==='object'),false);
 const r=supplied(text,'0','1');
 assert.equal(checkFor(c)({request:r}),false);
 assert.throws(()=>validateAskRequest(r,c),/append_span/);
});
test('context vocabulary cannot introduce a number or unit absent from the source',()=>{
 const text='Suppose 9 kg and 7 kg.',c=context(text),check=checkFor(c);
 for(const bad of ['0 kg','90 kg','9 lb','9 kg and 7 kg']){
  const r=supplied(text,bad,'7 kg','kg');
  assert.equal(check({request:r}),false);
  assert.throws(()=>validateAskRequest(r,c));
 }
 const mismatch=supplied(text,'9 kg','7 kg','hour');
 assert.throws(()=>validateAskRequest(mismatch,c),/premise_unit/);
});
test('prior USER and assistant text cannot populate current USER calculation vocabulary',()=>{
 const text='Calculate using those earlier quantities.',c=context(text);
 c.conversationTurns=[{id:'earlier',role:'user',text:'9 kg and 7 kg.'},{id:'assistant',role:'furvise',text:'9 kg and 7 kg.'}];
 for(const id of ['earlier','assistant','foreign']){
  const r=supplied(text,'9 kg','7 kg','kg');r.referenceTurnIds=[id];
  r.calculatePlan.calculations[0].operands.forEach(o=>o.sourceTurnId=id);
  assert.equal(checkFor(c)({request:r}),false);assert.throws(()=>validateAskRequest(r,c),/reference/);
 }
 const wrong=context('9 kg and 7 kg.');wrong.currentTurn.role='furvise';
 assert.equal(checkFor(wrong)({request:supplied(wrong.currentMessage,'9 kg','7 kg','kg')}),false);
 assert.throws(()=>validateAskRequest(supplied(wrong.currentMessage,'9 kg','7 kg','kg'),wrong),/calculate_scope/);
});
test('ambiguous repeated spans and vocabulary overflow never reopen unrestricted quotes',()=>{
 assert.deepEqual(currentUserNumericQuotes('9 kg then 9 kg.'),[]);
 assert.deepEqual(currentUserNumericQuotes('8'.repeat(401)+' kg'),[],'Envelope premiseQuotes has a 400-character limit');
 const c=context(Array.from({length:257},(_,i)=>String(10000+i)).join(' '));
 assert.deepEqual(currentUserNumericQuotes(c.currentMessage),[]);
 assert.equal(checkFor(c)({request:supplied(c.currentMessage,'10000','10001')}),false);
});

for(const [name,unit,from,to,wording] of [
 ['Juniper','mg','2037-04-07','2037-04-09','recorded dose difference'],
 ['Éclair','ml','2042-02-03','2042-02-12','change in logged fluid amount'],
 ['Orbit','min','2032-06-11','2032-07-01','saved activity duration delta'],
 ['Fern','cm','2031-08-02','2031-09-14','difference in historical length'],
 ['Subject 7','g','2028-01-03','2028-01-09','subtract the first recorded meal from the last'],
])for(const reverse of [false,true])test('frozen historical semantic obligation '+name+'/'+reverse,()=>{
 const text=name+': '+wording+' from '+from+' to '+to+'.',c=context(text);
 c.eligiblePets=[{...pets[0],name}];c.pet=c.eligiblePets[0];
 const ticket={...rawTicket(),subjectScope:'named',episode:null,searchHints:[],probes:[]};
 ticket.temporal={...ticket.temporal,from:from+'T00:00:00Z',to:to+'T00:00:00Z',calendar:null};
 const operands=[{...slot(1,0,name,'measurement',unit),measurementSelector:null},{...slot(0,0,name,'measurement',unit),measurementSelector:null}];
 const r=complete(plan([calculation('difference',operands,unit)]),ticket,text);r.petNames=[name];
 if(reverse)r.calculatePlan.calculations[0].operands.reverse();
 assert.equal(checkFor(c)({request:r}),true);
 const bound=validateAskRequest(r,c).request;
 assert.equal(bound.evidenceBasis,'saved_history');assert.ok(bound.readTicket);
 assert.deepEqual(bound.calculatePlan.calculations[0].operands.map(o=>[o.role,o.clause]),r.calculatePlan.calculations[0].operands.map(o=>[o.role,o.clause]));
 const contradiction={...structuredClone(r),evidenceBasis:'supplied_context',scope:'none',petNames:[],readTicket:null,premiseQuotes:['0','1']};
 assert.equal(checkFor(c)({request:contradiction}),false);assert.throws(()=>validateAskRequest(contradiction,c));
});
for(const text of ['What is the recorded length on April 7 and April 9?','Compare stored measurements for subjects 7 and 9.','Read recorded values labelled 7 and 9.'])test('lexical eligibility is explicitly not semantic authority: '+text,()=>{
 // A malicious semantic proposal can pass syntax: this is a documented Brain obligation,
 // not a test claiming that a mocked proposal proves language-model accuracy.
 assert.deepEqual(currentUserNumericQuotes(text),['7','9']);
 assert.equal(checkFor(context(text))({request:supplied(text)}),true);
 assert.ok(ASK_REQUEST_INSTRUCTIONS.includes('lexical source candidates only') && ASK_REQUEST_INSTRUCTIONS.includes('historical measurements'));
});
for(const order of [[0,1,2],[1,0,2],[2,0,1],[0,2,1]])test('strict canonical DAG order '+order,()=>{
 const text='Use 9 kg and 7 kg.',c=context(text),r=supplied(text,'9 kg','7 kg','kg');
 const nodes=[node('a','convert',[premise('9 kg','source','kg')],'g'),node('b','convert',[premise('7 kg','source','kg')],'g'),
 node('end','difference',[{kind:'result',role:'target',calculationId:'a'},{kind:'result',role:'reference',calculationId:'b'}],'g')];
 r.calculatePlan.calculations=order.map(i=>nodes[i]);
 assert.equal(checkFor(c)({request:r}),true,'Homogeneous array grammar does not prove sibling order');
 if(order[2]===2)assert.equal(validateAskRequest(r,c).request.calculatePlan.calculations.at(-1).id,'end');
 else assert.throws(()=>validateAskRequest(r,c),/backward_reference/);
});
for(const id of ['end','future','never_declared'])test('DAG cannot bind '+id,()=>{
 const text='Use 9 kg and 7 kg.',c=context(text),r=supplied(text,'9 kg','7 kg','kg');
 r.calculatePlan.calculations.push(node('end','convert',[{kind:'result',role:'source',calculationId:id}],'g'));
 assert.throws(()=>validateAskRequest(r,c),/backward_reference/);
});

const semanticsCheck=new Ajv().compile(sourceSemanticsSchema);
for(const classification of ['observation','unknown','attributed_correction'])for(const target of [null,{kind:'target_unknown'},
 {kind:'scope',from:'2044-02-01T00:00:00Z',to:'2044-03-01T00:00:00Z',conceptKey:null},{kind:'source',id:'forged'},{kind:'claim',id:'forged'}])
 test('source semantics discriminator parity '+JSON.stringify({classification,target}),()=>{
  const v={classification,target};assert.equal(semanticsCheck(v),readWriteSourceSemantics(v)!==null);
  const check=new Ajv().compile(appendJobSchema);
  assert.equal(check({operation:'append',petName:'Unrelated',items:[{bodyQuote:'Exact 日本語',dateQuote:null,occurredAt:null,semantics:v}],companionQuote:null}),readWriteSourceSemantics(v)!==null);
 });
