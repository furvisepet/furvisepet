import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {buildFurvisePlanningContext} from '../../app/lib/intelligence/planning-context.ts';
import {explicitlyNamedOwnedPets} from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
import {ownerNoteSourceSpans} from '../../app/lib/intelligence/owner-note-request.ts';
import {FurviseContextError} from '../../app/lib/intelligence/retrieve-context.ts';
import {publicV1AskCapability} from '../../app/lib/public-v1-capabilities.ts';
import {previewRecordedAskCapability} from '../../app/lib/intelligence/calculation-capability.ts';
export const id=n=>'89300000-0000-4000-8000-'+String(n).padStart(12,'0');
const input={userId:id(1),petId:id(11),conversationId:id(21),sourceMessageId:id(33),currentMessage:'What did that entry say?',locale:'en'};
const pet={id:id(11),user_id:id(1),name:'Juniper',species:'cat',sex:'female'};
export function planningFixture(change=()=>{}){
 const rows={
 dog_profiles:[pet,{...pet,id:id(12),user_id:id(2),name:'Foreign'}],
 ask_conversations:[{id:id(21),user_id:id(1),pet_profile_id:id(11)},{id:id(22),user_id:id(2),pet_profile_id:id(12)}],
 ask_conversation_messages:[
 {id:id(31),user_id:id(1),conversation_id:id(21),role:'user',request_id:id(41),sequence_number:1,user_text:'What did I save for Juniper?',created_at:'2026-01-01'},
 {id:id(32),user_id:id(1),conversation_id:id(21),role:'furvise',request_id:id(41),sequence_number:2,response_data:{summary:'untrusted assistant claims [care:'+id(51)+']'},created_at:'2026-01-02'},
 {id:id(33),user_id:id(1),conversation_id:id(21),role:'user',request_id:id(43),sequence_number:3,user_text:input.currentMessage,created_at:'2026-01-03'},
 {id:id(34),user_id:id(2),conversation_id:id(21),role:'furvise',request_id:id(41),sequence_number:2,response_data:{summary:'[care:'+id(52)+']'},created_at:'2026-01-02'},
 {id:id(35),user_id:id(1),conversation_id:id(22),role:'furvise',request_id:id(41),sequence_number:2,response_data:{summary:'[care:'+id(53)+']'},created_at:'2026-01-02'},
 {id:id(36),user_id:id(1),conversation_id:id(21),role:'furvise',request_id:id(99),sequence_number:2,response_data:{summary:'[care:'+id(54)+']'},created_at:'2026-01-02'},
 {id:id(37),user_id:id(1),conversation_id:id(21),role:'furvise',request_id:id(41),sequence_number:4,response_data:{summary:'[care:'+id(55)+']'},created_at:'2026-01-04'},
 ]};
 change(rows);
 const queries=[];
 const db={from(table){
  const q={table,columns:null,filters:[],orders:[],limit:null};queries.push(q);
  const chain={
   select(s){q.columns=s;return chain;},
   eq(k,v){q.filters.push(['eq',k,v]);return chain;},in(k,v){q.filters.push(['in',k,v]);return chain;},
   lt(k,v){q.filters.push(['lt',k,v]);return chain;},
   order(k,v){q.orders.push([k,v]);return chain;},limit(n){q.limit=n;return chain;},
   maybeSingle(){return Promise.resolve(result(true));},then(a,b){return Promise.resolve(result(false)).then(a,b);}
  };
  function result(single){
   assert.ok(rows[table],'planning may not load factual or write tables');
   let data=rows[table].filter(r=>q.filters.every(([op,k,v])=>op==='eq'?r[k]===v:op==='in'?v.includes(r[k]):r[k]<v));
   for(const [k,{ascending}]of q.orders)data=data.toSorted((a,b)=>ascending?a[k]-b[k]:b[k]-a[k]);
   if(q.limit!==null)data=data.slice(0,q.limit);
   // Supabase projection is real: omitted fields do not become authority.
   data=data.map(r=>Object.fromEntries(q.columns.split(',').map(k=>[k,r[k]])));
   return{data:single?data[0]||null:data,error:null};
  }
  return chain;
 }};
 return{rows,queries,args:{...input,supabase:db}};
}
export function assertPlanningQueries(queries){
 // Structural value comparison across the deliberate VM mutation realm.
 queries=JSON.parse(JSON.stringify(queries));
 const tables=queries.map(q=>q.table);
 assert.deepEqual(tables.slice(0,3),['dog_profiles','ask_conversations','ask_conversation_messages']);
 assert.ok(queries.length===3||queries.length===4,'one bounded optional citation read');
 for(const q of queries){
  assert.ok(q.filters.some(([op,k,v])=>op==='eq'&&k==='user_id'&&v===id(1)),'every query is owner-scoped');
  if(q.table==='ask_conversations'){
   assert.ok(q.filters.some(([,k,v])=>k==='id'&&v===id(21)));
   assert.ok(q.filters.some(([,k,v])=>k==='pet_profile_id'&&v===id(11)));
  }
  if(q.table==='ask_conversation_messages'){
   assert.ok(q.filters.some(([,k,v])=>k==='conversation_id'&&v===id(21)));
   assert.equal(q.limit,40);
   assert.deepEqual(q.orders,[['sequence_number',{ascending:false}]]);
   const role=q.filters.find(([,k])=>k==='role')?.[2];
   assert.ok(['user','furvise'].includes(role));
   if(role==='furvise'){
    assert.deepEqual(q.filters.find(([op,k])=>op==='in'&&k==='request_id')?.[2],[id(41)]);
    assert.deepEqual(q.filters.find(([op,k])=>op==='lt'&&k==='sequence_number'),['lt','sequence_number',3]);
    assert.equal(q.columns,'id,request_id,role,response_data,created_at,sequence_number');
   }else assert.equal(q.columns,'id,request_id,role,user_text,created_at,sequence_number');
  }
 }
}
export async function assertOwnedPlanningBoundary(loader=buildFurvisePlanningContext){
 const f=planningFixture();const c=JSON.parse(JSON.stringify(await loader(f.args)));assertPlanningQueries(f.queries);
 assert.deepEqual(c.eligiblePets.map(p=>p.id),[id(11)]);
 assert.deepEqual(c.pinnedUserSourceIds,[id(31)]);
 assert.deepEqual(c.conversationTurns.map(t=>[t.id,t.role,t.text]),[
 [id(31),'user','What did I save for Juniper?'],[id(32),'furvise','[care:'+id(51)+']'],[id(33),'user',input.currentMessage]]);
 for(const key of ['careEntries','selectedCareEntries','memories','activeConcerns'])assert.deepEqual(c[key],[]);
 return c;
}
export function planningMutant(source){
 const ast=ts.createSourceFile('planning-context.ts',source,ts.ScriptTarget.Latest,true);
 const code=ast.statements.filter(ts.isFunctionDeclaration).map(n=>n.getText(ast).replace(/^export /,'')).join('\n');
 return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nbuildFurvisePlanningContext',
 {FurviseContextError,ownerNoteSourceSpans,explicitlyNamedOwnedPets,Map,Set,Date});
}
export function assertRouteCapabilityOrdering(source=readFileSync(new URL('../../app/api/ask/route.ts',import.meta.url),'utf8')){
 const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
 const calls=[];let variable=null,mutationGuard=null,otherGuard=null;
 const executors=['prepareAppendTurn','continueLifecyclePlan','prepareStateTransitionTurn','prepareFieldMutationTurn','resolveRemovePlan','prepareBoundRemoveAction','resolveReplaceJob','prepareBoundReplaceAction','executeStoredRead','buildFurviseContext','generateAskHistoryAnswer'];
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))calls.push({name:n.expression.text,node:n});
  if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='publicV1Capability')variable=n;
  if(ts.isIfStatement(n)){
   const s=n.expression.getText(ast);
   if(s==='!publicV1Capability.available && publicV1Capability.reason === "mutation"')mutationGuard=n;
   if(s==='!interpretation.clarification && !publicV1Capability.available')otherGuard=n;
  }
  ts.forEachChild(n,visit);
 }visit(ast);
 assert.ok(variable&&ts.isCallExpression(variable.initializer));
 assert.equal(variable.initializer.expression.getText(ast),'previewRecordedAskCapability');
 assert.deepEqual(variable.initializer.arguments.map(x=>x.getText(ast)),['interpretation.request','userId']);
 assert.ok(mutationGuard&&otherGuard);
 assert.ok(variable.pos<mutationGuard.pos&&mutationGuard.pos<otherGuard.pos);
 for(const guard of [mutationGuard,otherGuard]){
  let returned=false;function returns(n){if(ts.isReturnStatement(n))returned=true;ts.forEachChild(n,returns);}returns(guard.thenStatement);assert.ok(returned,'denial exits route');
 }
 const append=calls.find(c=>c.name==='prepareAppendTurn');assert.ok(append&&mutationGuard.end<append.node.pos);
 const lifecycle=calls.find(c=>c.name==='continueLifecyclePlan');assert.ok(lifecycle&&otherGuard.end<lifecycle.node.pos);
 for(const c of calls.filter(c=>executors.includes(c.name)&&c.name!=='prepareAppendTurn'))assert.ok(otherGuard.end<c.node.pos,c.name+' must follow denial');
 assert.equal(calls.filter(c=>c.name==='previewRecordedAskCapability').length,1);
 return true;
}
export function assertPublicWrapperParity(){
 for(const owner of [id(1),id(2),'']){
  for(const key of ['appendJob','writeJob','removeJob','fieldMutationJob','stateTransitionJob','task']){
   const r={version:'ask-request.v2',mode:'mixed',[key]:{}};
   assert.deepEqual(previewRecordedAskCapability(r,owner),publicV1AskCapability(r));
   assert.equal(previewRecordedAskCapability(r,owner).reason,'mutation');
  }
  for(const r of [
   {version:'ask-request.v2',mode:'conversation',evidenceBasis:'general'},
   {version:'ask-request.v2',mode:'read',readTicket:{}},
   {lifecyclePlan:{pendingDisposition:'cancel',transition:null}},
   {lifecyclePlan:{pendingDisposition:'keep',transition:{toState:'archived'}}},undefined]){
   assert.deepEqual(previewRecordedAskCapability(r,owner),publicV1AskCapability(r));
  }
 }
}
export async function assertPublicRouteDenial(options={}){
 const {fixture,proposal}=await import('./ask-staged-route-fixture.mjs');
 const {prepareAskInterpretationRequest}=await import('../../app/lib/intelligence/interpret-ask.ts');
 const {admitAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
 const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
 const store=new MemoryAiGuardTestStore();
 let prepared,bound,planningContext,providerError;
 const f=fixture({...options,creditLedger:true,realCapabilityDenial:true,
  admitAiOperation:input=>admitAiOperation({...input,store,env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'owned-context-capability-synthetic-only'}}),
  onContext:c=>{planningContext=c;},
  onInterpretation:r=>{bound=r;},
  providerCreate:async request=>{try{
   prepared=prepareAskInterpretationRequest(planningContext,request.model);
   assert.deepEqual(request,prepared.request,'actual normal route uses this exact declared request');
   const complete={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:'prose',excludedPetNames:[],...proposal()};
   const outputs=complete.outputs??complete.readTicket.outputs;delete complete.outputs;
   const {bodyQuote,...append}=complete.appendJob;
   complete.appendJob={...append,items:[{bodyQuote,dateQuote:null,occurredAt:null,semantics:{classification:'observation',target:null}}]};
   complete.readTicket={authority:'effective_fact',probes:[],searchHints:null,episode:null,...complete.readTicket,outputs};
   complete.readTicket.temporal={calendar:null,...complete.readTicket.temporal};
   const {askRequestProviderSchema}=await import('../../app/lib/intelligence/ask-request-contract.ts');
   const {default:Ajv}=await import('ajv');
   const schema=askRequestProviderSchema({},planningContext);
   const branches=schema.properties.request.anyOf;
   const valid=new Ajv({allErrors:true,strict:false}).compile(branches.find(b=>b.properties?.mode?.enum?.includes('mixed')));
   if(!valid(complete))throw Error('SYNTHETIC_CANONICAL_FIELDS '+JSON.stringify(valid.errors));
   const wire=prepared.transport.encode({request:complete},()=>{});
   return{status:'completed',output_text:JSON.stringify(wire),usage:{input_tokens:100,output_tokens:10,total_tokens:110}};
   }catch(error){providerError=error;throw error;}
  }});
 const old=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 let res;
 try{res=await f.send();}finally{if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old;}
 if(providerError)throw providerError;
 const b=await res.json();
 assert.equal(res.status,200,JSON.stringify(f.state.errors.map(x=>({...x,error:String(x.error?.stack||x.error)}))));
 assert.ok(bound?.request.appendJob,'real full-wire original decoder/Binder accepted source-bound proposal');
 assert.match(b.response.directAnswer,/cannot change records yet/);
 assert.equal(f.state.planner,1,'only the one controlled interpretation may run');
 assert.equal(f.rows.pet_care_entries.length,2);
 assert.equal(f.rows.ask_action_capabilities.length,0);
 assert.equal(f.rows.ai_update_suggestions.length,0);
 assert.equal(f.state.credit?.status,'released');
 assert.ok(!f.state.events.some(e=>e==='heart:execute'||e==='read:pet_care_entries'||e==='suggestion:persist'||e.startsWith('write-attempt:')||e.startsWith('rpc-attempt:execute_')));
 return f;
}
