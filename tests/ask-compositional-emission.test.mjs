import { inspectAskWireContract } from "./helpers/ask-wire-contract.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_BRAIN_FIXTURES');};
const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
const {validateAskRequest,askRequestSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {bindCompositionalReadTicket}=await import('../app/lib/furvise-brain/read-selection.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const pets=['Aster','Bramble','Echo'].map(name=>({id:name.toLowerCase(),name,user_id:'owner',species:'dog'}));
const prior={id:'u0',role:'user',text:'Aster, Bramble and Echo are the pets I mean.'};
const clause=(direction='desc',count=1)=>({orderBy:[{field:'event_at',direction}],take:{count,per:'group'}});
const ticket=(union=[clause()],topic='weight')=>({authority:'effective_fact',subjectScope:'named',operation:'read',
  temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:'text_any',terms:topic==='weight'?['weight','weigh','weighed','weighing']:[topic]}],
  outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union},needs:[],episode:null,searchHints:null});
const context=(question,turns=[prior])=>({owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],
  currentMessage:question,currentTurn:{id:'u1',role:'user',text:question},conversationTurns:turns,timeZone:'UTC'});
const proposal=(question,readTicket=ticket(),patch={})=>({version:'ask-request.v2',mode:'read',readTicket,
  question,requirements:[],referenceTurnIds:[],evidenceBasis:'saved_history',scope:'named',petNames:pets.map(p=>p.name),
  operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,
  episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[],...patch});
async function mocked(question,readTicket=ticket(),patch={},ctx=context(question),reject=false){
  let calls=0;
  const pending=interpretAskQuestion({context:ctx,model:'fixture',client:{responses:{create:async request=>{
    calls++;
    const contract=await inspectAskWireContract(request,ctx);
    const requestSchema=contract.canonicalSchema.properties.request.anyOf.find(s=>s.properties?.evidenceBasis?.enum?.includes('saved_history') && s.properties?.calculatePlan?.type==='null');
    const schema=requestSchema.properties.readTicket;
    const compositional=schema.anyOf.find(s=>s.properties?.selection.type==='object');
    assert.ok(compositional.required.includes('selection'));
    assert.equal(compositional.properties.selection.additionalProperties,false);
    const candidate=proposal(question,readTicket,patch);
    // The legacy chronological / endpoint cases explicitly test Binder
    // compatibility. Only those use the existing Node fixture raw path;
    // all current provider proposals must pass the semantic-slots codec.
    const legacySelector=readTicket?.outputs?.strategy != null;
    return {output_text:legacySelector?JSON.stringify(candidate):contract.encodeResponse(candidate)};
  }}}});
  if(reject){await assert.rejects(pending);assert.equal(calls,1);return;}
  const result=await pending;
  assert.equal(calls,1);
  if(result.request?.readTicket)assert.ok(Object.isFrozen(result.request.readTicket));
  if(result.request?.readTicket?.selection){
    assert.equal(Object.hasOwn(result.request.readTicket.outputs,'strategy'),false);
    assert.equal(result.request.readTicket.outputs.limit,readTicket.outputs.limit);
  }
  assert.equal(result.readOnly,true);
  return result;
}
const semantics=r=>({selection:r.request.readTicket.selection,predicates:r.request.readTicket.predicates,
  outputs:r.request.readTicket.outputs,operation:r.request.readTicket.operation});

test('A latest semantic family: named, household and established pronouns share one selection',async()=>{
  const cases=[
    ["what is each dog's latest weight",'account',[]],
    ['last weight for all 3','conversation',pets.map(p=>p.name)],
    ['how much did each of these pets weigh most recently','conversation',pets.map(p=>p.name)],
    ['newest recorded weight for Aster Bramble and Echo','named',pets.map(p=>p.name)],
  ];
  const results=[];
  for(const [question,subjectScope,petNames] of cases){
    const r=await mocked(question,{...ticket(),subjectScope},{scope:subjectScope,petNames,
      referenceTurnIds:subjectScope==='conversation'?['u0']:[]});
    assert.deepEqual(r.petIds,pets.map(p=>p.id));results.push(semantics(r));
  }
  assert.ok(results.every(r=>JSON.stringify(r)===JSON.stringify(results[0])));
});
test('B earliest semantic family differs only by ascending semantic order',async()=>{
  for(const question of ['first weight for each','earliest recorded weight for them','go back to the first time each was weighed']){
    const r=await mocked(question,{...ticket([clause('asc')]),subjectScope:'conversation'},
      {scope:'conversation',referenceTurnIds:['u0']});
    assert.deepEqual(r.request.readTicket.selection.union,[clause('asc')]);
    assert.equal(r.request.readTicket.outputs.limit,null);
  }
});
test('C both boundaries are a union, with no new operation',async()=>{
  for(const question of ['first and latest weight for each','show where each started and their most recent recorded weight']){
    const r=await mocked(question,ticket([clause('asc'),clause('desc')]));
    assert.deepEqual(r.request.readTicket.selection.union,[clause('asc'),clause('desc')]);
    assert.deepEqual(r.request.readTicket.needs,[]);
  }
});
test('D two most recent per subject uses group cardinality, independent of presentation',async()=>{
  for(const question of ['last two weights each','give me two most recent measurements for every pet']){
    const read={...ticket([clause('desc',2)]),outputs:{...ticket().outputs,ordering:'asc'}};
    const r=await mocked(question,read);
    assert.deepEqual(r.request.readTicket.selection.union,[clause('desc',2)]);
    assert.equal(r.request.readTicket.outputs.ordering,'asc');assert.equal(r.request.readTicket.outputs.limit,null);
  }
});
test('E alternate predicates and different pets execute without application changes',async()=>{
  for(const topic of ['food','medication','observation']){
    for(const cohort of [pets,[{...pets[0],id:'other-a',name:'Juniper'},{...pets[1],id:'other-b',name:'Tamarack'}]]){
      const question='Most recent '+topic+' record for each';
      const ctx={...context(question),eligiblePets:cohort,pet:cohort[0],conversationTurns:[]};
      const r=await mocked(question,ticket([clause()],topic),{petNames:cohort.map(p=>p.name)},ctx);
      const rows=cohort.flatMap(p=>[1,2].map(day=>({id:p.id+'-'+day,user_id:'owner',pet_profile_id:p.id,
        note:topic,title:null,deleted_at:null,occurred_at:'2026-01-0'+day+'T00:00:00Z',created_at:'2026-01-0'+day+'T00:00:00Z'})));
      const scope={userId:'owner',ownedPetIds:cohort.map(p=>p.id),from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
      const result=await retrieveReadTicket(r.request.readTicket,scope,{effective:async records=>({records,reliable:true}),
        page:async({petId,offset,limit,ordering})=>rows.filter(row=>row.pet_profile_id===petId)
          .sort((a,b)=>ordering==='desc'?b.occurred_at.localeCompare(a.occurred_at):a.occurred_at.localeCompare(b.occurred_at)).slice(offset,offset+limit)});
      assert.deepEqual(result.records.map(r=>r.id).sort(),cohort.map(p=>p.id+'-2').sort());
    }
  }
});
test('F anchored plus grouped binds without a manufactured date',async()=>{
  const question='latest food after the dental for each pet';
  const read={...ticket([clause()],'food'),operation:'read_since_event',
    temporal:{from:null,to:null,anchor:{concept:'dental',relation:'after'},calendar:null}};
  const bound=bindCompositionalReadTicket(read,pets.map(p=>p.id));
  const result=await mocked(question,read,{},context(question));
  assert.deepEqual(result.request.readTicket,bound);
  assert.deepEqual(bound.temporal.anchor,read.temporal.anchor);
  assert.equal(read.temporal.from,null); // no guessed date or silent anchor removal
});
test('explicit temporal windows compose with grouped selection without rewriting the plan',async()=>{
  const read={...ticket(),temporal:{from:'2025-01-01T00:00:00Z',to:'2026-01-01T00:00:00Z',anchor:null,calendar:null}};
  const r=await mocked('latest weight for each during 2025',read);
  assert.deepEqual(r.request.readTicket.temporal,read.temporal);
});
test('G single-subject legacy input becomes one canonical compositional selection',async()=>{
  const dune={...pets[0],id:'dune',name:'Dune'};
  const question='when was Dune first weighed and what was it';
  const read={...ticket(),subjectScope:'selected',selection:null,
    outputs:{strategy:'chronological',completeness:'exhaustive',ordering:'asc',limit:1}};
  const r=await mocked(question,read,{scope:'selected',petNames:[]},
    {...context(question,[]),eligiblePets:[dune],pet:dune});
  assert.deepEqual(r.request.readTicket.selection,{groupBy:['subject'],union:[clause('asc',1)]});
  assert.deepEqual(r.petIds,['dune']);
  assert.equal(r.request.readTicket.outputs.completeness,'exhaustive');
});
test('H distinct grounded probes retain multi-need retrieval with selection null',async()=>{
  const first='Aster food in 2025',second='Bramble medication in 2024',question=first+' and '+second;
  const probes=[first,second].map((quote,i)=>({quote,sourceTurnId:null,petNames:[i?'Bramble':'Aster'],
    from:null,to:null,target:null,termGroups:[[i?'medication':'food']],ordering:'desc'}));
  const {needs:_needs,...base}=ticket(); void _needs;
  const read={...base,selection:null,predicates:[],probes,outputs:{...ticket().outputs,strategy:null}};
  const r=await mocked(question,read,{petNames:['Aster','Bramble'],evidenceNeeds:[]});
  assert.equal(r.request.readTicket.needs.length,2);
  assert.equal(r.request.readTicket.selection,undefined);
});
test('I unresolved pronouns clarify without adding subjects or invoking another planner',async()=>{
  const question='latest for those ones';
  const r=await mocked(question,{...ticket(),subjectScope:'conversation'},
    {scope:'conversation',petNames:[]},context(question,[]));
  assert.equal(r.clarification,'subject');assert.deepEqual(r.petIds,[]);
  assert.equal(r.request.readTicket,null);
});
test('I unresolved fact or anchor is rejected rather than guessed into a legal selection',async()=>{
  await mocked('last thing for each',{...ticket(),predicates:[{kind:'text_any',terms:[]}]},{},undefined,true);
  await mocked('latest after that for each',{...ticket(),operation:'read_since_event',
    temporal:{from:null,to:null,anchor:{concept:'',relation:'after'},calendar:null}},{},undefined,true);
});
test('J incompatible selectors and invented dimensions still reject with one planner call',async()=>{
  const base=ticket();
  const invalid=[
    {...base,outputs:{...base.outputs,strategy:'chronological'}},
    {...base,selection:{...base.selection,groupBy:['species']}},
    {...base,selection:{groupBy:['subject'],union:[{...clause(),take:{count:1,per:'account'}}]}},
    {...base,selection:{groupBy:['subject'],union:[{...clause(),take:{count:0,per:'group'}}]}},
    {...base,temporal:{...base.temporal,calendar:'oldest_year'}},
    {...base,episode:{operation:'count',referent:null}},
  ];
  for(const read of invalid)await mocked('latest for each',read,{},undefined,true);
});
test('explicit subset and selected scope never widen merely because grouping is present',async()=>{
  const question='latest for Aster and Echo';
  const named=await mocked(question,ticket(),{petNames:['Aster','Echo']});
  assert.deepEqual(named.petIds,['aster','echo']);
  const single=await mocked('latest here',{...ticket(),subjectScope:'selected'},{scope:'selected',petNames:[]});
  assert.deepEqual(single.petIds,['aster']);
});
test('provider exposes the existing closed shape; legacy binder remains authoritative',()=>{
  const schema=askRequestSchema({}).properties.readTicket.anyOf.find(s=>s.properties?.selection.type==='object').properties.selection;
  assert.deepEqual(Object.keys(schema.properties).sort(),['groupBy','union']);
  assert.deepEqual(schema.properties.union.items.properties.orderBy.items.properties.field.enum,['event_at']);
  assert.deepEqual(schema.properties.union.items.properties.take.properties.per.enum,['group']);
  const p=proposal('latest for each');
  const direct=bindCompositionalReadTicket(p.readTicket,pets.map(p=>p.id));
  assert.deepEqual(validateAskRequest(p,context(p.question)).request.readTicket,direct);
});

test('provider selection guidance permits semantic anchors while keeping operator exclusions',()=>{
  const description=askRequestSchema({}).properties.readTicket.anyOf.find(s=>s.properties?.selection.type==='object').properties.selection.description;
  assert.match(description,/Compatible with a semantic temporal\.anchor/);
  assert.match(description,/owned effective event and temporal boundary before selection/);
  assert.match(description,/Do not invent from\/to dates or choose a ledger event/);
  assert.match(description,/Incompatible with needs, episode, outputs\.strategy and calendar selectors/);
  assert.doesNotMatch(description,/unresolved anchors/);
});
test('interpreter anchor guidance delegates dates and ledger choice without widening history',async()=>{
  const {ASK_REQUEST_INSTRUCTIONS}=await import('../app/lib/intelligence/ask-request-contract.ts');
  assert.match(ASK_REQUEST_INSTRUCTIONS,/semantic temporal\.anchor MAY compose with predicates and selection/);
  assert.match(ASK_REQUEST_INSTRUCTIONS,/never the ledger event or invented from\/to dates/);
  assert.match(ASK_REQUEST_INSTRUCTIONS,/owned effective history.*concrete boundary before selection/);
  assert.match(ASK_REQUEST_INSTRUCTIONS,/Missing, ambiguous or uncertifiable anchors retain existing anchor limitations/);
  assert.match(ASK_REQUEST_INSTRUCTIONS,/never drop the anchor or fall back to whole history/);
  assert.match(ASK_REQUEST_INSTRUCTIONS,/Calendar selectors remain incompatible with selection/);
  assert.doesNotMatch(ASK_REQUEST_INSTRUCTIONS,/rejects selection with unresolved event anchors/);
});

test('provider alternatives exclude retired strategies and keep selection exclusive',()=>{
  const branches=askRequestSchema({}).properties.readTicket.anyOf;
  const identity=b=>b.type==='null'?'null':[
    b.properties.attributedContexts?'attributed':'primary',
    b.properties.selection.type==='object'?'selection':String(b.properties.outputs.properties.strategy.enum[0]),
  ].join(':');
  assert.deepEqual(branches.map(identity).sort(),[
    'null','primary:null','primary:chronological','primary:selection',
    'attributed:null','attributed:selection',
  ].sort());
  const primary=branches.filter(b=>!b.properties?.attributedContexts);
  const legacy=primary.filter(s=>s.properties?.selection.type==='null');
  const composed=primary.find(s=>s.properties?.selection.type==='object');
  for(const branch of branches.filter(b=>b.properties?.attributedContexts)){
    assert.deepEqual(branch.properties.authority.enum,['stored_report']);
    assert.ok(branch.required.includes('attributedContexts'));
    assert.equal(branch.properties.attributedContexts.type,'array');
    assert.equal(branch.properties.attributedContexts.minItems,1);
    assert.equal(branch.additionalProperties,false);
    const original=primary.find(b=>identity(b)===identity(branch).replace('attributed:','primary:'));
    const {authority,attributedContexts,...properties}=branch.properties;
    void authority;void attributedContexts;
    const {authority:originalAuthority,...originalProperties}=original.properties;void originalAuthority;
    assert.deepEqual(properties,originalProperties);
    assert.deepEqual(branch.required.filter(k=>k!=='attributedContexts'),original.required);
  }
  assert.deepEqual(branches[0],{type:'null'});
  assert.equal(composed.properties.outputs.additionalProperties,false);
  assert.equal(Object.hasOwn(composed.properties.outputs.properties,'strategy'),false);
  assert.deepEqual(composed.properties.outputs.required,['completeness','ordering','limit']);
  assert.equal(legacy.length,2);
  const chronological=legacy.find(b=>b.properties.outputs.properties.strategy.enum.includes('chronological')).properties.outputs;
  assert.deepEqual(chronological.properties.strategy.enum,['chronological']);
  assert.equal(chronological.properties.limit.type,'null');
  assert.deepEqual(legacy.map(b=>b.properties.outputs.properties.strategy.enum[0]),
    [null,'chronological']);
  assert.match(composed.properties.outputs.properties.limit.description,/transport.*selection.take/);
  assert.match(composed.properties.outputs.properties.ordering.description,/Presentation.*selection.orderBy/);
});

test('provider grammar requires finite chronological takes to use compositional selection',async()=>{
  const {default:Ajv}=await import('ajv');
  const validate=new Ajv({allErrors:true}).compile(askRequestSchema({}).properties.readTicket);
  const {needs:_finiteNeeds,...providerBase}=ticket(); void _finiteNeeds;
  const finite={...providerBase,probes:[],selection:null,outputs:{strategy:'chronological',completeness:'exhaustive',ordering:'asc',limit:1}};
  assert.equal(validate(finite),false,JSON.stringify(validate.errors));
  const unbounded={...finite,outputs:{...finite.outputs,limit:null}};
  assert.equal(validate(unbounded),true,JSON.stringify(validate.errors));
  const {needs:_composedNeeds,...composedBase}=ticket([clause('asc')]); void _composedNeeds;
  const composed={...composedBase,probes:[],outputs:{completeness:'sufficient',ordering:'asc',limit:null}};
  assert.equal(validate(composed),true,JSON.stringify(validate.errors));
});

test('captured A1 semantics omit strategy; every conflicting legacy strategy still rejects',async()=>{
  const base={...ticket(),searchHints:['weight','weigh','weighed','weighing'],
    outputs:{completeness:'exhaustive',ordering:'desc',limit:null}};
  const r=await mocked("for Aster Bramble and Echo what's the most recent weight you have for each one",base);
  assert.deepEqual(r.request.readTicket.selection,base.selection);
  for(const strategy of ['chronological','temporal_endpoints','calendar_samples','event_candidates']){
    const mixed={...base,operation:strategy==='temporal_endpoints'?'compare':'read',
      outputs:{...base.outputs,completeness:'sufficient',strategy}};
    assert.throws(()=>bindCompositionalReadTicket(mixed,pets.map(p=>p.id)),
      error=>error.cause?.field==='selection' && error.cause?.rule==='incompatible_with_legacy_selector');
  }
});

test('finite chronological input translates; unbounded legacy endpoint strategy fails closed',async()=>{
  const rows=[1,2].map(day=>({id:'aster-'+day,user_id:'owner',pet_profile_id:'aster',
    note:'weight',title:null,deleted_at:null,occurred_at:'2026-01-0'+day+'T00:00:00Z',
    created_at:'2026-01-0'+day+'T00:00:00Z'}));
  const scope={userId:'owner',ownedPetIds:['aster'],from:'2020-01-01T00:00:00Z',
    to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
  const store={effective:async records=>({records,reliable:true}),
    page:async({offset,limit,ordering})=>[...rows].sort((a,b)=>ordering==='desc'?
      b.occurred_at.localeCompare(a.occurred_at):a.occurred_at.localeCompare(b.occurred_at)).slice(offset,offset+limit)};
  for(const strategy of ['chronological','temporal_endpoints']){
    const read={...ticket(),selection:null,operation:strategy==='temporal_endpoints'?'compare':'read',
      outputs:{strategy,completeness:'exhaustive',ordering:'asc',limit:strategy==='chronological'?1:null}};
    if(strategy==='temporal_endpoints'){
      // Unbounded legacy endpoints also selected interior rows: no lossless endpoint-only translation.
      await mocked('recorded weights for Aster',read,{petNames:['Aster']},context('recorded weights for Aster'),true);
      continue;
    }
    const r=await mocked('recorded weights for Aster',read,{petNames:['Aster']});
    assert.deepEqual(r.request.readTicket.selection,{groupBy:['subject'],union:[clause('asc',1)]});
    assert.equal(r.request.readTicket.outputs.strategy,undefined);
    const result=await retrieveReadTicket(r.request.readTicket,scope,store);
    assert.deepEqual(result.records.map(r=>r.id),strategy==='chronological'?['aster-1']:['aster-1','aster-2']);
  }
});

test('completeness guidance describes proposition scope without changing enum or defaulting',async()=>{
 const {ASK_REQUEST_INSTRUCTIONS}=await import('../app/lib/intelligence/ask-request-contract.ts');
 assert.match(ASK_REQUEST_INSTRUCTIONS,/Classify completeness by the requested proposition/);
 assert.match(ASK_REQUEST_INSTRUCTIONS,/Setting sufficient does not establish certainty/);
 assert.match(ASK_REQUEST_INSTRUCTIONS,/Finite ordered takes are compositional selection obligations/);
 assert.match(ASK_REQUEST_INSTRUCTIONS,/Legacy chronological provider output is reserved for unbounded ordered retrieval/);
 const branches=askRequestSchema({}).properties.readTicket.anyOf.filter(b=>b.properties);
 for(const branch of branches){
  const field=branch.properties.outputs.properties.completeness;
  const calendar=branch.properties.outputs.properties.strategy?.enum.includes('calendar_samples');
  assert.deepEqual(field.enum,calendar?['sufficient']:['sufficient','exhaustive']);
  assert.equal(Object.hasOwn(field,'default'),false);
  assert.match(field.description,/Classify the requested proposition/);
  assert.match(field.description,/organs must independently certify/);
 }
});
test('bounded semantic families preserve sufficient through one mocked interpretation each',async()=>{
 const families=[
  [['most recent weight for Aster','the one I logged last for Aster','newest weight for Aster'],[clause()]],
  [['first recorded weight for Aster','oldest matching weight for Aster'],[clause('asc')]],
  [['newest one for each pet','give each pet their last recorded weight'],[clause()]],
  [['first and latest for each','show both ends of each pet weight history'],[clause('asc'),clause()]],
  [['last two recorded weights per pet'],[clause('desc',2)]]
 ];
 for(const [questions,union] of families)for(const question of questions){
  const r=await mocked(question,ticket(union));
  assert.equal(r.request.readTicket.outputs.completeness,'sufficient');
  assert.deepEqual(r.request.readTicket.selection.union,union);
 }
});

test('exhaustive listing, existence, absence and count-domain proposals retain exhaustive',async()=>{
 const cases=[
  ["show every weight I've recorded",'weight'],
  ['include the entire collection of recorded measurements','weight'],
  ['has Bramble ever vomited?','vomiting'],
  ['is there any vomiting anywhere in the saved history?','vomiting'],
  ['have I never logged a vaccine?','vaccine'],
  ['can the history establish that no vaccine was recorded?','vaccine']
 ];
 for(const [question,topic] of cases){
  const read={...ticket(undefined,topic),selection:null,
   outputs:{strategy:'chronological',ordering:'asc',limit:null,completeness:'exhaustive'}};
  const r=await mocked(question,read);
  assert.equal(r.request.readTicket.outputs.completeness,'exhaustive');
 }
});
test('window and anchor scope compose with either logical completeness requirement',async()=>{
 for(const anchor of [false,true])for(const exhaustive of [false,true]){
  const question=anchor
   ? exhaustive?'everything about food after the dental':'latest food after the dental'
   : exhaustive?'every weight in June':'latest weight in June';
  const read={...ticket(undefined,anchor?'food':'weight'),operation:anchor?'read_since_event':'read',
   temporal:anchor?{from:null,to:null,calendar:null,anchor:{concept:'dental',relation:'after'}}
    :{from:'2026-06-01T00:00:00Z',to:'2026-07-01T00:00:00Z',calendar:null,anchor:null}};
  if(exhaustive){read.selection=null;read.outputs={strategy:'chronological',completeness:'exhaustive',ordering:'asc',limit:null};}
  const r=await mocked(question,read);
  assert.equal(r.request.readTicket.outputs.completeness,exhaustive?'exhaustive':'sufficient');
  assert.deepEqual(r.request.readTicket.temporal,read.temporal);
 }
});

test('whole-history episode counts preserve exhaustive and the existing episode contract',async()=>{
 for(const question of ['how many vomiting episodes have I logged?','give the exact total of recorded vomiting episodes']){
  const read={...ticket(),selection:null,predicates:[],searchHints:null,
   episode:{operation:'count',referent:{basis:'scoped_register',topic:'vomiting',ordinal:null}},
   outputs:{strategy:null,completeness:'exhaustive',ordering:'asc',limit:null}};
  const r=await mocked(question,read,{quantity:null,petNames:['Aster']});
  assert.equal(r.request.readTicket.outputs.completeness,'exhaustive');
  assert.deepEqual(r.request.readTicket.episode,read.episode);
  assert.equal(r.readOperation,'count');
 }
});
