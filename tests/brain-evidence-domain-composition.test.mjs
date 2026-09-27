import Ajv from 'ajv';
import {assert,test,validateAskRequest,askRequestProviderSchema,rawTicket,slot,calculation,envelope,pets,fixture,finish,row} from './helpers/calculation-fixture.mjs';
globalThis.fetch=async()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};
const check=new Ajv({allErrors:true}).compile(askRequestProviderSchema({type:'object',additionalProperties:false,required:[],properties:{}}));
const context=(text,subjects=pets)=>({owner:{userId:'owner'},pet:subjects[0],eligiblePets:subjects,currentMessage:text,
 currentTurn:{id:'current',role:'user',text},conversationTurns:[],timeZone:'UTC'});
const complete=(plan,ticket,text)=>({...envelope(plan,ticket),question:text,outputFormat:null,temporalScope:null,
 profileFields:[],evidenceNeeds:[],excludedPetNames:[],mutationIntent:null,projection:null,recordSelection:null,task:null,
 storedRead:null,appendJob:null,writeJob:null,removeJob:null,fieldMutationJob:null,stateTransitionJob:null,lifecyclePlan:null});
const plan=calculations=>({operation:'calculate',calculations,resultSelection:null});
const node=(id,operator,operands,resultUnit)=>({id,operator,operands,resultUnit,precision:null});
const premise=(quote,role='member',unit='scalar',sourceTurnId=null)=>({kind:'premise',role,quote,unit,sourceTurnId});
const result=(calculationId,role='member')=>({kind:'result',role,calculationId});
const supplied=(text,operands,operator='sum',unit='scalar')=>({...complete(plan([node('root',operator,operands,unit)]),null,text),
 evidenceBasis:'supplied_context',scope:'none',petNames:[],premiseQuotes:[...new Set(operands.map(o=>o.quote))]});
const history=(text,subject=pets[0],unit='kg')=>{
 const ticket={...rawTicket(),subjectScope:'named',episode:null,searchHints:[],probes:[]};ticket.temporal.calendar=null;
 const r=complete(plan([calculation('difference',[{...slot(1,0,subject.name,'measurement',unit),measurementSelector:null},
 {...slot(0,0,subject.name,'measurement',unit),measurementSelector:null}],unit)]),ticket,text);
 r.petNames=[subject.name];return r;
};
const accept=(r,c=context(r.question))=>{assert.equal(check({request:r}),true,JSON.stringify(check.errors));return validateAskRequest(structuredClone(r),c);};
const reject=(r,c=context(r.question))=>{assert.equal(check({request:r}),false);assert.throws(()=>validateAskRequest(structuredClone(r),c));};

// Frozen semantic proposals, not a substitute language interpreter. Wording deliberately varies.
const corpus=[
 ['Nori','kg','2031-03-02','2031-03-19','pls compare her recorded mass at either end'],
 ['Éclair','ml','2028-02-01','2028-03-01','how much did the fluid amount change over that period?'],
 ['Juniper','mg','2040-11-04','2040-11-18','difference in recorded dose, ending minus starting please'],
 ['Orbit','min','2029-07-01','2029-07-12','exercise minutes: end vs beginning, just the change'],
 ['Pip','cm','2033-12-01','2034-01-01','length delta in the notes?'],
 ['Saffron','g','2035-04-02','2035-04-08','recorded meal amount change; dont save anything'],
 ['Taro','hour','2038-08-10','2038-08-21','sleep duration changed by how much?'],
 ['Uma','day','2030-01-03','2030-01-24','subtract first recorded duration from last'],
 ['Vega','lb','2042-05-01','2042-05-29','can u work out the change using saved measurements'],
 ['Wren','l','2032-10-01','2032-10-10','end quantity less beginning quantity, from records'],
];
for(const [name,unit,from,to,wording] of corpus)for(const reverse of [false,true])test(`history domain ${name}/${unit}/${reverse}`,async()=>{
 const subject={...pets[0],name},text=`${name}: ${wording}; ${from} through ${to}.`,r=history(text,subject,unit);
 Object.assign(r.readTicket.temporal,{from:from+'T00:00:00Z',to:to+'T00:00:00Z'});
 if(reverse)r.calculatePlan.calculations[0].operands.reverse();
 const bound=accept(r,context(text,[subject]));
 assert.equal(bound.request.evidenceBasis,'saved_history');assert.deepEqual(bound.petIds,[subject.id]);
 assert.deepEqual(bound.request.readTicket.temporal,r.readTicket.temporal);
 assert.deepEqual(bound.request.calculatePlan.calculations[0].operands.map(o=>[o.role,o.clause]),r.calculatePlan.calculations[0].operands.map(o=>[o.role,o.clause]));
 const contradiction={...structuredClone(r),evidenceBasis:'supplied_context',scope:'none',petNames:[],readTicket:null,premiseQuotes:[text]};
 reject(contradiction,context(text,[subject]));
});
for(const [label,text,a,b,unit,expected] of [
 ['scalar','If one portion is 12.5 and another is 3, subtract the latter.','12.5','3','scalar',9.5],
 ['negative','Given −2.5 versus 4, what is the signed change?','−2.5','4','scalar',-6.5],
 ['positive','😀 Toy example: +8 and 1.5, take the difference.','+8','1.5','scalar',6.5],
 ['mass','Suppose Fern had 1.50 kg, compared with 500 g. Difference?','1.50 kg','500 g','kg',1],
 ['volume','For a hypothetical amount, 2 l compared with 500 ml?','2 l','500 ml','l',1.5],
 ['duration','An exercise example: 2 hour less 30 min.','2 hour','30 min','hour',1.5],
])for(const reverse of [false,true])test(`free text exact premises ${label}/${reverse}`,()=>{
 const ops=[premise(a,'target',unit),premise(b,'reference',unit)];if(reverse)ops.reverse();
 const r=supplied(text,ops,'difference',unit),bound=accept(r).request;
 assert.equal(bound.readTicket,null);
 const values=Object.fromEntries(bound.calculatePlan.calculations[0].operands.map(o=>[o.role,Number(o.exact.numerator)/Number(o.exact.denominator)]));
 assert.equal(values.target-values.reference,expected);
 for(const o of bound.calculatePlan.calculations[0].operands){assert.equal(text.slice(o.source.start,o.source.end),o.source.text);assert.equal(o.source.sourceMessageId,'current');}
 assert.deepEqual(validateAskRequest(JSON.parse(JSON.stringify(r)),context(text)).request.calculatePlan,bound.calculatePlan);
});
for(const [operator,roles,out] of [['sum',['member','member'],'scalar'],['mean',['member','member'],'scalar'],
 ['difference',['target','reference'],'scalar'],['absolute_difference',['member','member'],'scalar'],
 ['ratio',['target','reference'],'scalar'],['percent_change',['target','reference'],'%'],['percent_of_sum',['part','member'],'%']])test(`shared role grammar ${operator}`,()=>{
 const r=supplied('Use 9 and 3.',[premise('9',roles[0]),premise('3',roles[1])],operator,out);accept(r);
 r.calculatePlan.calculations[0].operands[0].role='source';reject(r);
});
for(const quote of ['What changed for Zuri?','2041-08-03','March 5, 2044','Body length','temperature','difference','Zuri','9 kg and 3 kg','9 widgets',''])test(`invalid proposed numeric literal ${JSON.stringify(quote)}`,()=>{
 const r=supplied(quote,[premise(quote,'source','kg')],'convert','g');
 if(quote==='9 widgets'){assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context(quote)),/premise_unit/);}
 else reject(r);
});
test('numeric syntax does not grant factual/source authority or infer intent',()=>{
 const text='Please retrieve the saved quantity.',r=supplied(text,[premise('9 kg','source','kg')],'convert','g');
 assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context(text)),/append_span/);
 // A scalar substring can have several meanings in English. Brain owns that meaning;
 // neither schema nor Binder classifies raw dates, names or questions as arithmetic.
});
test('premise root cannot masquerade as saved-history authority',()=>{
 const text='Use 9 kg.',r=history(text);r.calculatePlan=plan([node('root','convert',[premise('9 kg','source','kg')],'g')]);reject(r);
});
for(const change of ['self','forward','unknown'])test(`result ${change} reference stays Binder-owned`,()=>{
 const r=supplied('Use 9 kg.',[premise('9 kg','source','kg')],'convert','g');
 r.calculatePlan.calculations.push(node('second','convert',[result('root','source')],'kg'));
 accept(r);
 r.calculatePlan.calculations[1].operands[0].calculationId=change==='self'?'second':change==='unknown'?'absent':'later';
 if(change==='forward')r.calculatePlan.calculations.push(node('later','convert',[result('root','source')],'kg'));
 assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context(r.question)),/backward_reference/);
});
test('a lone result has no implicit producer in either evidence domain',()=>{
 for(const r of [history('Use saved facts.'),supplied('Use 9 kg.',[premise('9 kg','source','kg')],'convert','g')]){
 r.calculatePlan.calculations=[node('only','convert',[result('implicit','source')],'g')];reject(r);
 }
});
test('current USER premise scope rejects prior, assistant and absent turns',()=>{
 const text='Use the previous quantity and 3.',r=supplied(text,[premise('9','member','scalar','prior'),premise('3')]);
 const c=context(text);c.conversationTurns=[{id:'prior',role:'user',text:'Assume 9.'}];r.referenceTurnIds=['prior'];
 assert.throws(()=>validateAskRequest(r,c),/reference/);
 c.conversationTurns[0].role='furvise';assert.throws(()=>validateAskRequest(r,c),/reference/);
 c.conversationTurns=[];assert.throws(()=>validateAskRequest(r,c),/reference/);
});
for(const kind of ['count_records','elapsed_days'])test(`premise domain excludes ${kind}`,()=>{
 const r=supplied('Use 9 and 3.',[premise('9','start'),premise('3','end')],kind,'day');
 if(kind==='count_records'){r.calculatePlan.calculations[0].operands=[];r.calculatePlan.calculations[0].resultUnit='records';}
 reject(r);
});
test('mixed premise/result nodes fail without silently converting inputs',()=>{
 const r=supplied('Use 9 and 3.',[premise('9'),premise('3')]);
 r.calculatePlan.calculations.push(node('derived','sum',[result('root'),premise('9')],'scalar'));reject(r);
});
test('foreign read subject and wrong slot cannot gain authority through valid outer shape',()=>{
 for(const edit of [r=>r.calculatePlan.calculations[0].operands[0].petName='Other owner',r=>r.calculatePlan.calculations[0].operands[0].clause=7]){
 const r=history('Use saved facts.');edit(r);assert.equal(check({request:r}),true);assert.throws(()=>validateAskRequest(r,context(r.question)));
 }
});
test('real deterministic history publication retains roles, provenance and zero provider calls',async()=>{
 const f=await fixture({sourceRows:[row('first','sample 4 kg'),row('last','sample 7 kg',3),row('foreign','sample 999 kg',2,pets[1].id)]});
 const final=await finish(f);assert.equal(f.calls(),0);assert.ok(final.valid);
 assert.ok(!JSON.stringify(f.response).includes('999'));assert.equal(f.response.calculationLabs.execution.results[0].value,3);
});
