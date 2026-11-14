import {prepareSourceSentenceWire} from "../app/lib/ask-read-only/source-sentence-wire.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {buildReadOnlyProviderRequest} from '../app/lib/ask-read-only/provider-request.mjs';
import {readOnlyAnswerSchemaForSources,readOnlyToolsForPets} from '../app/lib/ask-read-only/core.mjs';
import {clinicalAnswerSchema,clinicalSelectionSchema,validateClinicalAssessment} from '../app/lib/ask-read-only/clinical-policy.mjs';
import {componentAnswerSchema,componentSelectionSchema} from '../app/lib/ask-read-only/task-components.mjs';
import {readOnlyProvider} from '../app/lib/ask-read-only/provider.ts';
const policy={maxInputCharacters:80000,maxInputTokens:20000};
const assessment={medicationIntent:'none',referent:'clear',missingContext:[],careContext:'none',eventAssessments:[]};
const pets=[{handle:'p1',name:'Spruce',species:'cat'}],owners=[{ref:'owner1',text:'Please summarize the whole saved period.'}];
const plan=[{id:'t1',kind:'saved_content',combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:'collection',workflow:'none',pets:['p1'],reference:null,missing:[]}];
const sources=Array.from({length:32},(_,i)=>({handle:'s'+(i+1),kind:'history',petName:'Spruce',body:'The owner recorded a single grooming visit. No ongoing problem was reported.',eventAt:'2021-01-15T12:00:00Z',recordedAt:'2021-01-16T12:00:00Z',measurements:[]}));
function expand(schema){
 const defs=schema.$defs??{};
 function walk(n){
  if(!n||typeof n!=='object'||Array.isArray(n))return n;
  if(n.$ref)return walk(defs[n.$ref.slice(8)]);
  const o={...n};delete o.$defs;
  for(const k of ['properties'])if(n[k])o[k]=Object.fromEntries(Object.entries(n[k]).map(([k,v])=>[k,walk(v)]));
  for(const k of ['anyOf','allOf','oneOf'])if(n[k])o[k]=n[k].map(walk);
  if(n.items)o.items=walk(n.items);
  return o;
 }return walk(schema);
}
test('both real Ask schemas share exact repeated constraints while preserving every admitted original source',t=>{
 const context={question:'Summarize the collection.',dialogue:[],pets,references:[],taskPlan:plan};
 const final=componentAnswerSchema(clinicalAnswerSchema(readOnlyAnswerSchemaForSources(sources),validateClinicalAssessment(assessment),owners,pets),plan,sources,owners);
 const selection=componentSelectionSchema(clinicalSelectionSchema(readOnlyToolsForPets(pets),owners),context);
 for(const [phase,schema] of [['read_selection',selection],['read_answer',final]]){
  const input={instructions:'All original safety instructions remain.',context,selectionSchema:selection,schema:final,draft:'',SOURCE_CATALOG:sources.map(({handle,...s})=>({source:handle,...s})),TOOL_DATA:[{scope:{goal:'complete_set'},inspected:36,omitted:4,sources:sources.map(s=>({source:s.handle}))}]};
  const before=structuredClone(input),wire=buildReadOnlyProviderRequest('model',input,phase,2400,policy),compact=wire.text.format.schema;
  assert.ok(compact.$defs,'active wire must use shared schema definitions');
  assert.deepEqual(expand(compact),phase==="read_answer"?prepareSourceSentenceWire(input).schema:schema);assert.deepEqual(input,before);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(schema).length);
  const expandedWire=structuredClone(wire);expandedWire.text.format.schema=schema;
  t.diagnostic(JSON.stringify({phase,schemaCharactersBefore:JSON.stringify(schema).length,schemaCharactersAfter:JSON.stringify(compact).length,requestCharactersBefore:JSON.stringify(expandedWire).length,requestCharactersAfter:JSON.stringify(wire).length,admittedBodies:32,examinedCandidates:36}));
  const validate=new Ajv({strict:false}).compile(compact);
  assert.equal(validate({}),false);
  assert.ok(wire.instructions.startsWith(input.instructions));assert.equal(wire.max_output_tokens,2400);assert.equal(wire.store,false);
  assert.equal(wire.input.at(-1).content,context.question);
  if(phase==='read_answer'){
   const packet=JSON.parse(wire.input[0].content);
   assert.deepEqual(packet.SOURCE_CATALOG.map(({sentences,...s})=>({...s,body:sentences.join("")})),input.SOURCE_CATALOG);assert.equal(packet.TOOL_DATA[0].omitted,4);
  }
 }
});
test('a physical request carries a unique non-content lookup ID and size diagnostics on success',async()=>{
 const events=[],ids=[];
 const client={responses:{async create(wire,options){
  ids.push(options.headers?.['X-Client-Request-Id']);
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}],usage:{input_tokens:100,output_tokens:20}};
 }}};
 const invoke=readOnlyProvider('model',e=>events.push(e),client);
 for(let i=0;i<2;i++)await invoke({instructions:'policy',context:{question:'Private owner question.'},schema:{type:'object'}},'read_answer');
 assert.ok(ids.every(id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id)));assert.notEqual(ids[0],ids[1]);
 for(const e of events.filter(e=>e.outcome==='started')){
  const d=JSON.parse(e.validationDetails);assert.ok(ids.includes(d.clientRequestId));assert.ok(d.requestCharacters>0);assert.ok(!e.validationDetails.includes('Private owner'));
 }
});
test('timeout settles once, cancels the SDK signal, retains its lookup ID, and ignores late success without retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const events=[];let resolve,options,calls=0;
 const invoke=readOnlyProvider('model',e=>events.push(e),{responses:{create(_wire,o){calls++;options=o;return new Promise(r=>{resolve=r;});}}});
 const pending=invoke({instructions:'policy',context:{question:'Private owner question.'},schema:{type:'object'}},'read_answer');
 const rejection=assert.rejects(pending,e=>e.failureReason==='primary_timeout'||e.message==='The read-only answer could not be completed.');
 for(let i=0;i<12&&!options;i++)await Promise.resolve();
 assert.ok(options);t.mock.timers.tick(60001);await rejection;
 assert.equal(options.signal.aborted,true);assert.equal(calls,1);assert.equal(events.filter(e=>e.outcome==='failed').length,1);
 const diagnostic=JSON.parse(events.find(e=>e.outcome==='failed').validationDetails);
 assert.equal(diagnostic.clientRequestId,options.headers['X-Client-Request-Id']);assert.ok(diagnostic.requestCharacters>0);
 resolve({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}],usage:{input_tokens:100,output_tokens:20}});
 await Promise.resolve();await Promise.resolve();
 assert.equal(events.filter(e=>e.outcome==='succeeded').length,0);assert.equal(calls,1);
});
