import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { readTicketProviderSchema } from '../app/lib/furvise-brain/read-ticket-provider-schema.ts';
import { bindTypedReadTicket } from '../app/lib/furvise-brain/typed-read-ticket.ts';
import { askRequestProviderSchema, validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';

const validate = new Ajv({allErrors:true}).compile(readTicketProviderSchema);
const ticket = (strategy=null, operation='read') => ({
 operation,subjectScope:'named',temporal:{from:'2026-01-01T00:00:00Z',to:'2026-01-02T00:00:00Z',anchor:null,calendar:null},
 predicates:[],outputs:{strategy,completeness:'sufficient',ordering:'asc',limit:null},
 searchHints:null,episode:null,selection:null,probes:[],
});
const selected = () => ({groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]});
const bind = value => { const {probes,...semantic}=value; assert.deepEqual(probes,[]); return bindTypedReadTicket(semantic,['owned-pet']); };
const anchor = {concept:'procedure',relation:'after'};
const legal = [
 ['ordinary bounded read',ticket()],
 ['unbounded chronological',ticket('chronological')],
 ['anchored ordinary read',{...ticket(null,'read_since_event'),temporal:{...ticket().temporal,anchor}}],
 ['anchored selection',{...ticket(null,'read_since_event'),temporal:{...ticket().temporal,anchor},
  selection:selected(),outputs:{completeness:'sufficient',ordering:'asc',limit:null}}],
];
for(const [name,value] of legal) test('provider/Binder legal: '+name,()=>{
 const before=structuredClone(value);assert.equal(validate(value),true,JSON.stringify(validate.errors));
 assert.ok(bind(value));assert.deepEqual(value,before);
});
const legacyOnly = [
 ['comparison endpoints',ticket('temporal_endpoints','compare')],
 ['event candidates', {...ticket('event_candidates'),predicates:[{kind:'text_any',terms:['procedure']}]}],
 ...['read','compare','rank','read_since_event'].map(operation=>['calendar '+operation,{
  ...ticket('calendar_samples',operation),temporal:{...ticket().temporal,anchor:operation==='read_since_event'?anchor:null}}]),
];
for(const [name,value] of legacyOnly)test('legacy-only input remains bindable: '+name,()=>{
 assert.equal(validate(value),false);assert.ok(bind(value));
});
const illegal = [
 ['read endpoints',ticket('temporal_endpoints')],
 ['compare event candidates',ticket('event_candidates','compare')],
 ['empty event predicates',ticket('event_candidates')],
 ['exhaustive calendar',{...ticket('calendar_samples'),outputs:{...ticket('calendar_samples').outputs,completeness:'exhaustive'}}],
 ['chronological calendar',{...ticket('chronological'),temporal:{...ticket().temporal,calendar:'oldest_year'}}],
 ['finite chronological',{...ticket('chronological'),outputs:{...ticket('chronological').outputs,limit:1}}],
 ...['chronological','temporal_endpoints','calendar_samples','event_candidates'].map(strategy=>[
  'selection plus '+strategy,{...ticket(strategy,strategy==='temporal_endpoints'?'compare':'read'),
   predicates:strategy==='event_candidates'?[{kind:'text_any',terms:['procedure']}]:[],selection:selected()}]),
 ...['chronological','temporal_endpoints','calendar_samples','event_candidates'].map(strategy=>[
  'episode plus '+strategy,{...ticket(strategy),episode:{operation:'count',referent:null}}]),
 ...['chronological','temporal_endpoints','calendar_samples','event_candidates'].map(strategy=>[
  'probes plus '+strategy,{...ticket(strategy),probes:[{quote:'procedure',sourceTurnId:null,petNames:['Aster'],
   from:null,to:null,target:null,termGroups:[['procedure']],ordering:'desc'}]}]),
 ['selection with calendar',{...ticket(),selection:selected(),temporal:{...ticket().temporal,calendar:'oldest_year'},
  outputs:{completeness:'sufficient',ordering:'asc',limit:null}}],
 ['selection with episode',{...ticket(),selection:selected(),episode:{operation:'count',referent:null},
  outputs:{completeness:'sufficient',ordering:'asc',limit:null}}],
];
for(const [name,value] of illegal)test('provider rejects: '+name,()=>assert.equal(validate(value),false));
test('non-provider callers still face authoritative strategy checks',()=>{
 for(const value of [ticket('temporal_endpoints'),ticket('event_candidates','compare'),ticket('event_candidates'),
  {...ticket('calendar_samples'),outputs:{...ticket('calendar_samples').outputs,completeness:'exhaustive'}}])
  assert.throws(()=>bind(value));
});
test('general anchor/operation coupling deliberately remains Binder-only',()=>{
 for(const value of [{...ticket(),temporal:{...ticket().temporal,anchor}},ticket(null,'read_since_event')]){
  assert.equal(validate(value),true);assert.throws(()=>bind(value),e=>e.cause?.rule==='anchor_iff_read_since_event');
 }
});
test('whole Ask provider contract permits ordinary bounded measurement recall',()=>{
 const request={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,
  lifecyclePlan:null,appendJob:null,readTicket:ticket(),writeJob:null,task:null,temporalScope:'historical',
  mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:'ask-request.v2',
  mode:'read',question:'What measurement was recorded that day?',requirements:[],evidenceNeeds:[],outputFormat:null,
  evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',
  petNames:['Aster'],operation:'recall',selection:'summary',quantity:'measurement',topic:'history',terms:[],
  from:'2026-01-01',to:'2026-01-02',episodeTopic:null,ordinal:null,frame:null};
 const check=new Ajv({allErrors:true}).compile(askRequestProviderSchema({type:'object',additionalProperties:false,properties:{},required:[]}));
 assert.equal(check({request}),true,JSON.stringify(check.errors));assert.ok(bind(request.readTicket));
 const context={owner:{userId:'owner'},pet:{id:'owned-pet',name:'Aster',user_id:'owner'},eligiblePets:[{id:'owned-pet',name:'Aster',user_id:'owner'}],currentMessage:request.question,currentTurn:{id:'current',role:'user',text:request.question},conversationTurns:[],timeZone:'UTC'};
 for(const strategy of [null,'chronological'])for(const completeness of ['sufficient','exhaustive'])for(const ordering of ['asc','desc']){
  const r=structuredClone(request);r.readTicket=ticket(strategy);Object.assign(r.readTicket.outputs,{completeness,ordering});
  assert.equal(check({request:r}),true,JSON.stringify(check.errors));
  const bound=validateAskRequest(r,context);assert.equal(bound.request.readTicket.outputs.strategy ?? null,null);
 }
 const r=structuredClone(request);r.readTicket={...ticket(),selection:selected(),outputs:{completeness:'sufficient',ordering:'asc',limit:null}};
 assert.equal(check({request:r}),true);assert.deepEqual(validateAskRequest(r,context).request.readTicket.selection,selected());
 for(const value of legacyOnly){const r=structuredClone(request);r.readTicket=value[1];assert.equal(check({request:r}),false);}
 const independent=structuredClone(request);independent.readTicket=ticket('chronological');independent.evidenceNeeds=[{quote:'What measurement',sourceTurnId:null,petNames:['Aster'],terms:['measurement'],order:'context'}];
 assert.equal(check({request:independent}),false,'Chronological provider branch excludes independent legacy obligations');
 independent.readTicket.outputs.strategy=null;assert.equal(check({request:independent}),true,'The independent obligation fixture has a legal provider shape');

});
test('every provider object remains closed and fully required with no conditional grammar',()=>{
 const visit=node=>{if(!node||typeof node!=='object')return;
  assert.equal(Object.hasOwn(node,'if'),false);assert.equal(Object.hasOwn(node,'then'),false);
  if(node.properties){assert.equal(node.additionalProperties,false);assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());}
  for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else visit(child);
 };visit(readTicketProviderSchema);
});
