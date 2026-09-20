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
const ticket=(union=[clause()],topic='weight')=>({subjectScope:'named',operation:'read',
  temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:'text_any',terms:topic==='weight'?['weight','weigh','weighed','weighing']:[topic]}],
  outputs:{strategy:null,completeness:'sufficient',ordering:'desc',limit:null},
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
    const schema=request.text.format.schema.properties.readTicket;
    assert.ok(schema.required.includes('selection'));
    assert.equal(schema.properties.selection.additionalProperties,false);
    return {output_text:JSON.stringify(proposal(question,readTicket,patch))};
  }}}});
  if(reject){await assert.rejects(pending);assert.equal(calls,1);return;}
  const result=await pending;
  assert.equal(calls,1);
  if(result.request?.readTicket)assert.ok(Object.isFrozen(result.request.readTicket));
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
test('G single-subject legacy selection remains legal with provider selection null',async()=>{
  const dune={...pets[0],id:'dune',name:'Dune'};
  const question='when was Dune first weighed and what was it';
  const read={...ticket(),subjectScope:'selected',selection:null,
    outputs:{strategy:'chronological',completeness:'exhaustive',ordering:'asc',limit:1}};
  const r=await mocked(question,read,{scope:'selected',petNames:[]},
    {...context(question,[]),eligiblePets:[dune],pet:dune});
  assert.equal(r.request.readTicket.selection,undefined);
  assert.deepEqual(r.petIds,['dune']);assert.equal(r.selection,'earliest');
});
test('H distinct grounded probes retain multi-need retrieval with selection null',async()=>{
  const first='Aster food in 2025',second='Bramble medication in 2024',question=first+' and '+second;
  const needs=[first,second].map((quote,i)=>({needId:'need:'+i,from:null,to:null,target:null,
    termGroups:[[i?'medication':'food']],ordering:'desc'}));
  const read={...ticket(),selection:null,predicates:[],needs};
  const r=await mocked(question,read,{petNames:['Aster','Bramble'],evidenceNeeds:[first,second].map((quote,i)=>({
    quote,sourceTurnId:null,petNames:[i?'Bramble':'Aster'],terms:[i?'medication':'food'],order:'latest'}))});
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
  const schema=askRequestSchema({}).properties.readTicket.properties.selection;
  assert.deepEqual(Object.keys(schema.properties).sort(),['groupBy','union']);
  assert.deepEqual(schema.properties.union.items.properties.orderBy.items.properties.field.enum,['event_at']);
  assert.deepEqual(schema.properties.union.items.properties.take.properties.per.enum,['group']);
  const p=proposal('latest for each');
  const direct=bindCompositionalReadTicket(p.readTicket,pets.map(p=>p.id));
  assert.deepEqual(validateAskRequest(p,context(p.question)).request.readTicket,direct);
});

test('provider selection guidance permits semantic anchors while keeping operator exclusions',()=>{
  const description=askRequestSchema({}).properties.readTicket.properties.selection.description;
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
