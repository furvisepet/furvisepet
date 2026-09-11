import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { planDeterministicAskCommand } from '../app/lib/ai/ask-command-router.ts';
import { classifyFurviseCapabilityQuestion, buildFurviseCapabilityResponse } from '../app/lib/ai/ask-internal-product-policy.ts';

const root = new URL('../', import.meta.url);
// Run production functions, not copies of their implementation. Dependencies at
// network/React boundaries are controlled to exercise ordering and failures.
function extract(path, name, globals = {}) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let found;
  function walk(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n; ts.forEachChild(n, walk); }
  walk(ast); assert.ok(found, name);
  const js = ts.transpileModule(found.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInNewContext(js + '\n' + name, { Response, Request, URL, Buffer, ...globals });
}
const noop = () => {};

test('compound and other-pet navigation retains interpretation; standalone commands still route', () => {
  for (const input of ["Show Milo's profile and explain his weight trend", "Open Luna's profile", 'Show her care history, then summarize it', 'View the profile because she is limping']) {
    assert.equal(planDeterministicAskCommand(input, 'Milo'), null, input);
  }
  for (const input of ["Open Milo's profile", 'Show her care history', 'Please view the Vet Brief.', 'Go to the pet profile']) {
    assert.equal(planDeterministicAskCommand(input, 'Milo')?.routeType, 'application_action', input);
  }
  assert.equal(planDeterministicAskCommand("Open Mr. Cat's profile", 'Mr. Cat')?.routeType, 'application_action');
});

test('output instructions do not become feature gates; current capability copy stays truthful', () => {
  for (const input of ["Export Milo's weight records as CSV", 'Download these notes', 'Write a printable report', 'What did the PDF say about his weight?', 'Show all history as JSON']) {
    assert.equal(classifyFurviseCapabilityQuestion(input), null, input);
  }
  assert.equal(classifyFurviseCapabilityQuestion('Does Furvise support PDF exports?'), 'vet_prep_exports');
  assert.match(buildFurviseCapabilityResponse('vet_prep_exports').summary, /export.*PDF/);
  for (const kind of ['vet_prep_exports', 'long_history_patterns', 'live_product_research']) {
    assert.doesNotMatch(JSON.stringify(buildFurviseCapabilityResponse(kind)), /Results|curated static|not built yet/);
  }
});

function saveLookup(turns, entries) {
  const queries = [];
  const supabase = { from(table) {
    const filters = []; let limit = Infinity;
    const chain = { select() { return chain; }, eq(k,v) { filters.push(row=>row[k]===v); return chain; }, is(k,v) { filters.push(row=>row[k]===v); return chain; }, order() { return chain; }, limit(n) { limit=n; return chain; }, returns() { queries.push(table); return Promise.resolve({data:entries.filter(row=>filters.every(f=>f(row))).slice(0,limit),error:null}); } };
    return chain;
  } };
  const run = extract('app/api/ask/route.ts','findExistingCareEventForSaveRequest');
  return { queries, run:message=>run({context:{conversationTurns:turns}, currentSourceMessageId:'now', message, petId:'milo',userId:'owner',supabase}) };
}
const recovery = {id:'old',role:'user',text:'Milo is eating better'};
const entry = {id:'entry',user_id:'owner',pet_profile_id:'milo',intelligence_source_message_id:'old',deleted_at:null,concern_id:null};
test('new observations never reuse an older recovery receipt',async()=>{
  const h=saveLookup([recovery],[entry]);
  for(const q of ['Please save that Luna missed breakfast to her history','Save that Milo missed breakfast to history','Save this and add his new weight']) assert.equal(await h.run(q),null);
  assert.equal(h.queries.length,0);
});
test('repeat-save requires exactly one live owned event on the immediately preceding turn',async()=>{
  assert.equal((await saveLookup([recovery],[entry]).run('Can you save that?')).alreadyPersisted,true);
  assert.equal((await saveLookup([recovery],[entry]).run('Save that to care history')).currentSafetyState,null);
  for(const entries of [[],[{...entry,deleted_at:'2026-01-01'}],[{...entry,pet_profile_id:'luna'}],[{...entry,user_id:'other'}],[entry,{...entry,id:'two',pet_profile_id:'luna'}]]) {
    assert.equal(await saveLookup([recovery],entries).run('Save that'),null);
  }
  assert.equal(await saveLookup([recovery,{id:'newer',role:'user',text:'Milo missed breakfast'}],[entry]).run('Save that'),null);
});

test('Cancel sends a durable cancellation and never confirms the action',async()=>{
  let slots=[], cursor=0;const calls=[];
  const card=extract('app/ask/page.tsx','ApplicationActionCard',{
    React:{createElement:(type,props,...children)=>({type,props:props||{},children})},
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v];},
    secondaryButton:'',quietButton:'',dangerButton:'',
  });
  const action={id:'a',status:'pending',confirmationPolicy:'always',safetyClass:'DESTRUCTIVE',label:'Delete',description:'Review'};
  const render=()=>{cursor=0;return card({action,onAction:async(_,decision)=>calls.push(decision)});};
  function button(tree,label){if(!tree||typeof tree!=='object')return null;if(tree.type==='button'&&tree.children.includes(label))return tree;for(const c of tree.children||[]){const b=button(c,label);if(b)return b;}return null;}
  button(render(),'Review action').props.onClick();button(render(),'Cancel').props.onClick();
  await Promise.resolve();assert.deepEqual(calls,['cancel']);
});

function openHarness() {
  const pending=new Map(), selected=[], errors=[], loading=[]; const conversationLoadRef={current:0};
  const run=extract('app/ask/page.tsx','openConversation',{
    conversations:[{id:'A'},{id:'B'}],setOlderMessagesCursor:noop,setOlderMessagesLoading:noop,conversationLoadRef,askRequestActiveRef:{current:false},saveCurrentDraft:noop,setError:e=>errors.push(e),setStatus:noop,setLoading:v=>loading.push(v),dismissOnboardingEntry:noop,
    conversationJson:url=>new Promise((resolve,reject)=>pending.set(url.split('/').at(-1),{resolve,reject})),parseConversationDetail:()=>[],setSelectedPet:noop,window:{localStorage:{}},persistActivePetId:noop,replaceAskLocation:noop,setActiveConversationId:id=>selected.push(id),setThread:noop,setFailedRequest:noop,setQuestion:noop,readAskDraft:()=>'',setHistoryOpen:noop,trackAskEvent:noop,requestAnimationFrame:noop,
  });
  return {run,pending,selected,errors,loading,conversationLoadRef};
}
test('last conversation selection wins against late successes and late failures',async()=>{
  for(const fail of [false,true]){
    const h=openHarness();const a=h.run('A'),b=h.run('B');
    h.pending.get('B').resolve({conversation:{id:'B',petId:'pet-B'}});await b;
    if(fail)h.pending.get('A').reject(new Error('late failure'));else h.pending.get('A').resolve({conversation:{id:'A',petId:'pet-A'}});
    await a;assert.deepEqual(h.selected,['B']);assert.equal(h.errors.includes('late failure'),false);assert.equal(h.loading.filter(x=>x===false).length,1);
  }
});
test('leaving a conversation during loading invalidates its completion',async()=>{
  const h=openHarness(),p=h.run('A');h.conversationLoadRef.current++;
  h.pending.get('A').resolve({conversation:{id:'A',petId:'pet-A'}});await p;assert.deepEqual(h.selected,[]);
});

test('dismiss renders canonical saved result and rejects unrecognized results',async()=>{
  for(const status of ['already_applied','dismissed','unknown']){
    let state=[];const run=extract('app/ask/page.tsx','applyStateSuggestion',{
      setThread:fn=>state=fn(state),updateMessageSuggestion:(current,id,sid,patch)=>[...current,patch],suggestionJson:async()=>({status,careEntryId:'saved'}),updateMessageSuggestionIfSaving:current=>current,markAppDataChanged:noop,refreshConversations:async()=>{},getFriendlySuggestionError:e=>e.message,
    });
    await run('m',{id:'s'},'dismiss');
    assert.equal(state.at(-1).uiStatus,status==='unknown'?'failed':status);
    if(status==='already_applied')assert.equal(state.at(-1).status,'saved');
  }
});

test('finalization retries idempotently and returns only durable fallback state',async()=>{
  for(const succeedsAt of [1,2,Infinity]){
    let calls=0,reads=0;const persisted={assistantMessage:{id:'m',response_data:{directAnswer:'durable'}}};
    const run=extract('app/api/ask/route.ts','finalizePersistedAskAnswer',{
      finalizeAskAssistantResponse:async()=>++calls===succeedsAt?{data:true,error:null}:{data:null,error:new Error('offline')},
      loadPersistedRequestByConversation:async()=>{reads++;return persisted;},logAskServerError:noop,
    });
    const result=await run({messageId:'m',responseData:{directAnswer:'new'},requestId:'r'});
    assert.equal(result,succeedsAt===Infinity?persisted:null);assert.equal(calls,Math.min(2,succeedsAt));assert.equal(reads,succeedsAt===Infinity?1:0);
  }
});
test('missing durable finalization cannot be returned as saved success',async()=>{
  const run=extract('app/api/ask/route.ts','finalizePersistedAskAnswer',{
    finalizeAskAssistantResponse:async()=>({data:false,error:null}),loadPersistedRequestByConversation:async()=>null,
    AskApiError:Error,FURVISE_ASK_UNAVAILABLE_MESSAGE:'Unavailable',
  });
  await assert.rejects(run({messageId:'m'}));
});

function dataClient(tables, {failTable, expressions=[]}={}) {
  return {from(table){
    let filters=[],ordering=[],limit=Infinity,single=false;
    const query={select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},lt(k,v){filters.push(r=>r[k]<v);return query;},is(k,v){filters.push(r=>r[k]===v);return query;},in(k,values){filters.push(r=>values.includes(r[k]));return query;},order(k,{ascending}){ordering.push({k,ascending});return query;},limit(n){limit=n;return query;},or(expression){expressions.push(expression);const match=/last_activity_at\.lt\.(.*),and\(last_activity_at.eq\..*,id.lt\.(.*)\)/.exec(expression);assert.ok(match);filters.push(r=>r.last_activity_at<match[1]||(r.last_activity_at===match[1]&&r.id<match[2]));return query;},returns(){return query;},maybeSingle(){single=true;return query;},then(resolve,reject){let data=[...(tables[table]||[])].filter(r=>filters.every(f=>f(r)));data.sort((a,b)=>{for(const {k,ascending}of ordering){if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(ascending?1:-1);}return 0;});data=data.slice(0,limit);return Promise.resolve({data:failTable===table?null:single?data[0]||null:data,error:failTable===table?new Error('offline'):null}).then(resolve,reject);}};
    return query;
  }};
}
const uuid=n=>'81000000-0000-4000-8000-'+String(n).padStart(12,'0');
const isUuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);
test('history pagination includes unanswered threads, preserves timestamp precision, and cannot select another owner',async()=>{
  const rows=Array.from({length:81},(_,i)=>({id:uuid(i+1),user_id:'owner',last_activity_at:'2026-09-10T01:01:01.123456Z'}));
  rows.push({id:uuid(90),user_id:'other',last_activity_at:'2026-09-10T01:01:02.000000Z'});
  const expressions=[];const supabase=dataClient({ask_conversations:rows},{expressions});
  const get=extract('app/api/ask/conversations/route.ts','GET',{getAskConversationRequestContext:async()=>({supabase,userId:'owner'}),isUuid,toConversationSummary:r=>r});
  const seen=[];let after=null;
  do {const r=await get(new Request('https://example.test/api/ask/conversations'+(after?'?after='+after:'')));assert.equal(r.status,200);const body=await r.json();seen.push(...body.conversations.map(r=>r.id));after=body.nextCursor;}while(after);
  assert.equal(seen.length,81);assert.equal(new Set(seen).size,81);assert.equal(seen.includes(uuid(90)),false);assert.ok(expressions.every(x=>x.includes('.123456Z')));
  for(const cursor of ['garbage',Buffer.from(JSON.stringify({id:uuid(1),at:'2026-09-10T00:00:00Z),id.gt.anything'})).toString('base64url')])assert.equal((await get(new Request('https://example.test/api/ask/conversations?after='+cursor))).status,400);
});

test('long conversations load newest first, then every earlier exchange without gaps or duplicates',async()=>{
  for(const length of [99,100,101,2049]){
    const messages=Array.from({length},(_,i)=>({id:uuid(i+100),request_id:'request-'+Math.floor(i/2),role:i%2?'furvise':'user',sequence_number:i+1,user_id:'owner',conversation_id:uuid(1),created_at:'2026-01-01',response_data:i%2?{directAnswer:'answer'}:null}));
    const supabase=dataClient({ask_conversations:[{id:uuid(1),user_id:'owner'}],ask_conversation_messages:messages});
    const get=extract('app/api/ask/conversations/[id]/route.ts','GET',{getAskConversationRequestContext:async()=>({supabase,userId:'owner'}),isUuid,reconcileAskSuggestions:async()=>[],loadActionCapabilitiesForMessages:async()=>new Map(),toConversationDetail:(c,m)=>({...c,messages:m})});
    let before=null,seen=[],pages=0;
    do{
      const response=await get(new Request('https://example.test/conversation'+(before?'?before='+before:'')),{params:Promise.resolve({id:uuid(1)})});assert.equal(response.status,200);
      const {conversation:c}=await response.json();assert.ok(c.messages.length<=100);assert.deepEqual(c.messages.map(m=>m.sequence_number),c.messages.map(m=>m.sequence_number).sort((a,b)=>a-b));
      if(pages===0)assert.equal(c.messages.at(-1).sequence_number,length);
      seen.push(...c.messages.map(m=>m.id));before=c.olderMessagesCursor;assert.ok(++pages<30);
    }while(before);
    assert.equal(seen.length,length);assert.equal(new Set(seen).size,length);
    assert.equal((await get(new Request('https://example.test/conversation?before=NaN'),{params:Promise.resolve({id:uuid(1)})})).status,400);
  }
});

test('conversation lookup outages remain retryable instead of becoming not-found',async()=>{
  const get=extract('app/api/ask/conversations/[id]/route.ts','GET',{getAskConversationRequestContext:async()=>({supabase:dataClient({},{failTable:'ask_conversations'}),userId:'owner'}),isUuid});
  assert.equal((await get(new Request('https://example.test/conversation'),{params:Promise.resolve({id:uuid(1)})})).status,503);
});

test('urgent presentation never drops a safety section or a late avoidance instruction',async()=>{
  const {applyAskAnswerEconomy,planAskAnswerDepth}=await import('../app/lib/ai/ask-answer-economy.ts');
  const answer={summary:'Seek urgent care.',sections:Array.from({length:8},(_,i)=>({heading:'Step '+i,items:Array.from({length:3},(_,j)=>'Avoid hazard '+i+'-'+j+'.')}))};
  const result=applyAskAnswerEconomy(answer,planAskAnswerDepth({message:'Emergency',minimumSafetyLevel:'urgent'}));
  assert.equal(result.sections.length,8);assert.equal(result.sections.flatMap(s=>s.items).length,24);assert.match(JSON.stringify(result),/Avoid hazard 7-2/);
});

test('explicit incomplete or failed provider items cannot be accepted under a completed envelope',async()=>{
  const {interpretStructuredProviderResponse}=await import('../app/lib/ai/ask-provider.ts');
  for(const status of ['incomplete','failed']){
    let parsed=false;const result=interpretStructuredProviderResponse({status:'completed',output_text:'{}',output:[{status}]},()=>{parsed=true;return{};});
    assert.equal(result.status,status);assert.equal(parsed,false);
  }
  const result=interpretStructuredProviderResponse({status:'completed',output_text:'{}',usage:{input_tokens:-1,output_tokens:0.5}},JSON.parse);
  assert.equal(result.usage.inputTokens,null);assert.equal(result.usage.outputTokens,null);
});

test('optional telemetry failure does not turn optional work into a failed answer',async()=>{
  const {runOptionalAskSubsystem}=await import('../app/lib/ai/ask-turn-model.ts');
  assert.equal(await runOptionalAskSubsystem({component:'suggested_questions',fallback:'safe',operation:async()=>{throw new Error('optional failed');},onFailure:()=>{throw new Error('reporter failed');}}),'safe');
});


function failedSubmitHarness({refreshFails=false,requestFailure='http'}={}) {
  const state={failed:null,phase:'idle',active:false,thread:[],conversations:[],requests:[],refreshes:0};
  const activeRef={current:false};
  let serverConversation=null;
  const run=extract('app/ask/page.tsx','ask',{
    composerUnavailable:false,askRequestActiveRef:activeRef,activeConversationId:null,selectedPet:'pet',
    dismissOnboardingEntry:noop,crypto:{randomUUID:()=> 'logical-turn'},navigator:{language:'en'},
    buildAskRequestPayload:input=>input,createMessageId:()=> 'user-turn',
    setAskRequestActive:v=>state.active=v,setRequestPhase:v=>state.phase=v,setFailedRequest:v=>state.failed=v,
    setError:noop,setPersistenceWarning:noop,setStatus:noop,setQuestion:noop,
    setThread:updater=>state.thread=updater(state.thread),trackAskEvent:noop,
    AbortSignal:{timeout:()=>({})},getBrowserSupabase:()=>({auth:{}}),
    requestAskWithSession:(_auth,send)=>send('token'),
    idempotentClientFetch:async(_url,options,scope,id)=>{
      state.requests.push({payload:JSON.parse(options.body),scope,id});
      serverConversation={id:'server-created-before-failure'};
      if(requestFailure==='network')throw Error('connection lost');
      return Response.json({success:false,code:'ANSWER_RETRYABLE'},{status:503});
    },
    parseAskConversationResponse:()=>null,
    AskRequestError:class extends Error {constructor(code){super(code);this.code=code;}},
    getAskFailure:error=>({code:error.code||'ANSWER_RETRYABLE',retryAfterSeconds:4}),
    refreshConversations:async()=>{
      state.refreshes++;
      // Retry state must be committed before list discovery starts.
      assert.equal(state.phase,'failed');assert.ok(state.failed);
      if(refreshFails)throw Error('list unavailable');
      state.conversations=[serverConversation];
    },
  });
  return {run,state,activeRef};
}

test('failed first turns refresh server-created conversations without changing retry identity',async()=>{
  for(const requestFailure of ['http','network']) {
    const h=failedSubmitHarness({requestFailure});
    await h.run('Save my question','composer');
    assert.equal(h.state.conversations[0].id,'server-created-before-failure');
    assert.equal(h.state.refreshes,1);assert.equal(h.state.phase,'failed');
    assert.equal(h.state.active,false);assert.equal(h.activeRef.current,false);
    const retry=h.state.failed;
    await h.run('Save my question','composer',retry);
    assert.deepEqual(h.state.requests[1],h.state.requests[0]);
    assert.equal(h.state.thread.length,1);
    assert.equal(h.state.failed.userMessageId,retry.userMessageId);
  }
});

test('a failed sidebar refresh preserves the original failure and unlocks retry',async()=>{
  const h=failedSubmitHarness({refreshFails:true});
  await h.run('Save my question','composer');
  assert.equal(h.state.refreshes,1);assert.equal(h.state.failed.code,'ANSWER_RETRYABLE');
  assert.equal(h.state.failed.retryAfterSeconds,4);
  assert.equal(h.state.phase,'failed');assert.equal(h.state.active,false);assert.equal(h.activeRef.current,false);
  assert.equal(h.state.failed.payload.message,'Save my question');
});
