import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(s,c,next) { return s === "server-only"
  ? { url:"data:text/javascript,export {};",format:"module",shortCircuit:true } : next(s,c); } });
globalThis.fetch = async () => { throw Error("OFFLINE_ONLY"); };
const { translateLegacyReadSelection } = await import("../app/lib/intelligence/legacy-read-selection.ts");
const { bindReadTicket } = await import("../app/lib/furvise-brain/read-ticket.ts");
const { bindCompositionalReadTicket,eventOrder } = await import("../app/lib/furvise-brain/read-selection.ts");
const { retrieveReadTicket } = await import("../app/lib/furvise-brain/lungs.ts");
const { retrieveAskHistory } = await import("../app/lib/intelligence/history-retrieval.ts");
const { selectionPublication } = await import("../app/lib/intelligence/selection-publication.ts");
const { derivePublicationAuthority } = await import("../app/lib/intelligence/publication-authority.ts");
const { buildLabsList,serializeLabsList } = await import("../app/lib/intelligence/labs-list.ts");
const scope={userId:"owner",ownedPetIds:["a","b","c"],from:"2010-01-01T00:00:00.000Z",to:"2027-01-01T00:00:00.000Z",asOf:"2026-09-20T00:00:00.000Z"};
const at=i=>new Date(Date.UTC(2016,0,i+1)).toISOString();
const row=(pet,i,note="weight "+i+" kg")=>({id:pet+"-"+i,user_id:"owner",pet_profile_id:pet,occurred_at:at(i),created_at:at(i),updated_at:at(i),deleted_at:null,title:null,note,category:"general",severity:null});
const clause=(direction,count=1)=>({orderBy:[{field:"event_at",direction}],take:{count,per:"group"}});
function input(strategy="chronological",ordering="desc",limit=1,patch={}) {
 return {operation:strategy==="temporal_endpoints"?"compare":"read",subjectScope:"named",needs:[],episode:null,
  temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:"text_any",terms:["weight"]}],
  outputs:{strategy,ordering,limit,completeness:"sufficient"},...patch};
}
function native(proposal,pets=["a"]) {
 const {strategy,...outputs}=proposal.outputs;
 return bindCompositionalReadTicket({...proposal,outputs,
  selection:{groupBy:["subject"],union:strategy==="chronological"?[clause(outputs.ordering,outputs.limit)]:[clause("asc"),clause("desc")]}},pets);
}
function store(rows,{deleted=[],correction=null,partial=false,unavailable=false}={}) {
 const calls=[];
 return {calls,
  page:async q=>{calls.push(q);if(unavailable)throw Error("storage_unavailable");
   return rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&r.occurred_at>=q.from&&r.occurred_at<q.to)
    .sort((a,b)=>q.ordering==="desc"?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit);},
  effective:async acquired=>({records:acquired.filter(r=>!deleted.includes(r.id)),reliable:true}),
  effectiveWindow:async({rows:acquired,petId})=>({records:[...acquired.filter(r=>!deleted.includes(r.id)&&r.id!==correction?.replaces),
    ...(correction?.record.pet_profile_id===petId?[correction.record]:[])],
    lineageClosed:!partial,replacementSeedsExhausted:!partial,sourceLineage:[],
    reasons:partial?["correction_closure_unavailable_or_ambiguous"]:[],graphCalls:1,lineageRows:acquired.length}),
 };
}
function evidence(ticket,result) {
 const represented=result.records.map(r=>({sourceId:"care:"+r.id,petId:r.pet_profile_id,sourceType:"care_update",field:"value",text:r.note,occurredAt:r.occurred_at,start:0,end:r.note.length}));
 return {version:"ask-evidence.v1",petNames:{a:"Alpha",b:"Beta",c:"Gamma"},
  scope:{authorizedPetIds:[...ticket.subjects.petIds],requestText:"fixture",status:"resolved",readOnlyRecall:true,requestKind:"record_lookup"},
  interpretation:{operation:"recall",readOperation:"recall",petIds:[...ticket.subjects.petIds],readOnly:true,
   request:{mode:"read",quantity:"records",evidenceBasis:"saved_history",readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[],outputFormat:"prose"}},
  history:{ticketCoverage:result.coverage,provenance:[],perPet:[],needs:[],candidateIds:represented.map(r=>r.sourceId),
   claimSources:[],excludedIds:[],continuation:[],reasons:[],retrieval:"partial",corrections:"complete"},
  represented,sources:[],losses:[],representation:"complete",verifiedFacts:[],
  completeness:{retrieval:"partial",corrections:"complete",extraction:"complete",grouping:"complete"}};
}

const plain=(p,pets)=>{const{strategy,...outputs}=p.outputs;return bindReadTicket({...p,outputs},pets);};
function unbounded(direction="asc",patch={}) {
 return input("chronological",direction,null,{outputs:{strategy:"chronological",ordering:direction,limit:null,completeness:"exhaustive"},...patch});
}
const ids=r=>r.records.map(x=>x.id);
async function setParity(p,rows,{pets=["a","b","c"],options={},legacy=true}={}){
 const old=bindReadTicket(p,pets),adapted=translateLegacyReadSelection(old),ticket=plain(p,pets);
 assert.equal(adapted.translated,true);assert.equal(adapted.reason,"equivalent_ordered_result_set");
 assert.deepEqual(adapted.ticket,ticket);assert.equal(ticket.selection,undefined);assert.equal(ticket.outputs.strategy,undefined);
 const a=await retrieveReadTicket(adapted.ticket,scope,store(rows,options)),b=await retrieveReadTicket(ticket,scope,store(rows,options));
 assert.deepEqual(a,b);
 assert.equal(a.coverage.chronology,undefined);
 const al=buildLabsList(evidence(adapted.ticket,a),a.records),bl=buildLabsList(evidence(ticket,b),b.records);
 assert.deepEqual(derivePublicationAuthority(evidence(adapted.ticket,a),al?.records ?? []),derivePublicationAuthority(evidence(ticket,b),bl?.records ?? []));
 assert.deepEqual(al,bl);assert.equal(al ? serializeLabsList(al) : null,bl ? serializeLabsList(bl) : null);
 if(legacy){
  const s=store(rows,options);s.effective=async acquired=>({records:[...acquired.filter(r=>!options.deleted?.includes(r.id)&&r.id!==options.correction?.replaces),
   ...(options.correction?[options.correction.record]:[])],reliable:true});
  const before=await retrieveReadTicket(old,scope,s);
  assert.deepEqual(a.records,before.records);
  assert.deepEqual(a.coverage.selection,before.coverage.selection);
  assert.deepEqual(a.coverage.continuation,before.coverage.continuation);
  assert.equal(a.coverage.status,before.coverage.status);
 }
 return {ticket,result:a,labs:al,proof:a.coverage.resultSet};
}
async function assertUnavailable(r) {
 const {generateContextAwareAskResponse}=await import("../app/lib/ai/ask-reasoning.ts");
 const {reviewHistoricalAnswer}=await import("../app/lib/intelligence/review-history-narrative.ts");
 const {validateGeneratedAnswer}=await import("../app/lib/intelligence/validation/validate-answer.ts");
 let calls=0;const client={responses:{create:async()=>{calls++;throw Error("NO_PROVIDER_CALL");}}};
 const e=evidence(r.ticket,r.result),profiles=r.ticket.subjects.petIds.map(id=>({id,user_id:"owner",name:e.petNames[id],species:"cat",avoid_ingredients:[]}));
 const result=await generateContextAwareAskResponse({evidenceContract:e,profiles,careEntries:r.result.records,
  memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:"List saved records.",requestId:"result-set-test",locale:"en-CA",client});
 assert.equal(result.model,"server-history-unavailable");assert.equal(result.labsList,undefined);
 assert.deepEqual(result.relevantContextIds,[]);assert.equal(result.referencedRecords?.length||0,0);
 assert.equal(await reviewHistoricalAnswer({result,client}),true);
 const context={pet:profiles[0],eligiblePets:profiles,currentMessage:"List saved records.",memories:[],careEntries:r.result.records,
  askInterpretation:e.interpretation,askHistory:{entries:r.result.records,coverage:{ticketCoverage:r.result.coverage}}};
 const validation=validateGeneratedAnswer(result,context,"routine",r.ticket.subjects.petIds);
 assert.equal(validation.valid,true);assert.equal(validation.assessment.outcome,"limited");
 assert.deepEqual(result.evidenceContract.history.ticketCoverage,r.result.coverage);
 assert.match(result.answer.summary,/does not establish that matching records are absent/);assert.equal(calls,0);
}
const dataset=()=>[row("a",1),row("b",4),row("a",3),row("c",2)];
for(const direction of ["asc","desc"])test("complete effective result set "+direction+" preserves legacy and native facts",async()=>{
 const rows=dataset(),r=await setParity(unbounded(direction),rows);
 assert.deepEqual(ids(r.result),[...rows].sort((a,b)=>direction==="asc"?eventOrder(a,b):eventOrder(b,a)).map(r=>r.id));
 assert.equal(r.proof.certified,true);assert.equal(r.proof.matchingSetComplete,true);assert.equal(r.proof.representationComplete,true);
});
test("single subject unbounded reads have no semantic take",async()=>{
 const r=await setParity(unbounded(),dataset().filter(r=>r.pet_profile_id==="a"),{pets:["a"]});
 assert.equal(r.ticket.selection,undefined);assert.equal(r.proof.subjects.length,1);
});
test("rotated subject scopes retain identical records and exhaustion",async()=>{
 let first;
 for(const pets of [["a","b","c"],["c","a","b"],["b","c","a"]]){
  const r=await setParity(unbounded(),dataset(),{pets});
  if(first){assert.deepEqual(r.result.records,first.result.records);assert.deepEqual(r.proof.subjects,first.proof.subjects);}
  else first=r;
 }
});
test("explicit window applies after effective truth and before ordered result",async()=>{
 const r=await setParity(unbounded("desc",{temporal:{from:at(2),to:at(4),anchor:null,calendar:null}}),dataset());
 assert.deepEqual(ids(r.result),["a-3","c-2"]);assert.equal(r.proof.certified,true);
 assert.equal(r.proof.windows[0].from,at(2));
});
test("no matches is complete_empty only after exhaustion and closure",async()=>{
 const r=await setParity(unbounded(),dataset().map(r=>({...r,note:"observation"})));
 assert.equal(r.result.coverage.status,"complete_empty");assert.equal(r.proof.certified,true);
 // This proves the literal predicate set, not absence of the broader concept.
 assert.equal(r.labs,null);
});
test("a corrected record replaces the old matching identity",async()=>{
 const r=await setParity(unbounded(),dataset(),{options:{correction:{replaces:"a-3",record:{...row("a",5,"weight corrected"),id:"corrected"}}}});
 assert.deepEqual(ids(r.result),["a-1","c-2","b-4","corrected"]);
});
test("deleted matching record is absent from the semantic result",async()=>{
 const r=await setParity(unbounded(),dataset(),{options:{deleted:["a-3"]}});
 assert.deepEqual(ids(r.result),["a-1","c-2","b-4"]);
});
test("out-of-page correction overlay cannot create false exhaustive completeness",async()=>{
 const rows=Array.from({length:300},(_,i)=>row("a",i));
 const r=await setParity(unbounded(),rows,{pets:["a"],options:{correction:{replaces:"a-1",record:{...row("a",3),id:"outside-correction"}}}});
 assert.ok(r.proof.matchingIds.includes("outside-correction"));assert.ok(!r.proof.matchingIds.includes("a-1"));
 assert.equal(r.proof.matchingSetComplete,false);assert.equal(r.proof.certified,false);assert.equal(r.result.coverage.status,"partial");
});
test("more than 32 matching records distinguishes complete set from representation",async()=>{
 const r=await setParity(unbounded(),Array.from({length:100},(_,i)=>row("a",i)),{pets:["a"]});
 assert.equal(r.proof.matchingIds.length,100);assert.equal(r.proof.retainedIds.length,32);assert.equal(r.proof.omittedIds.length,68);
 assert.equal(r.proof.matchingSetComplete,true);assert.equal(r.proof.representationComplete,false);assert.equal(r.proof.certified,false);
 await assertUnavailable(r);
});
test("oversized source is omitted whole, later fitting records survive, omission stays visible",async()=>{
 const rows=[row("a",1,"weight "+"x".repeat(19000)),row("b",2),row("c",3)];
 const r=await setParity(unbounded(),rows);
 assert.deepEqual(ids(r.result),["b-2","c-3"]);assert.deepEqual(r.proof.omittedIds,["a-1"]);
 assert.equal(r.proof.certified,false);assert.ok(r.proof.reasons.includes("matching_records_not_represented"));
});
test("combined character pressure preserves exact whole bodies and loss metadata",async()=>{
 const rows=[row("a",1,"weight "+"x".repeat(10000)),row("b",2,"weight "+"y".repeat(10000)),row("c",3)];
 const r=await setParity(unbounded(),rows);
 assert.deepEqual(ids(r.result),["a-1","c-3"]);assert.equal(r.result.records[0].note,rows[0].note);
 assert.deepEqual(r.proof.omittedIds,["b-2"]);assert.equal(r.proof.certified,false);
});
test("per-subject exhaustion survives another subject's incomplete scan",async()=>{
 const rows=[...Array.from({length:300},(_,i)=>row("a",i)),row("b",0)];
 const r=await setParity(unbounded(),rows);
 assert.equal(r.proof.subjects.find(s=>s.petId==="a").matchingSetComplete,false);
 assert.equal(r.proof.subjects.find(s=>s.petId==="b").matchingSetComplete,true);
 assert.equal(r.proof.subjects.find(s=>s.petId==="c").matchingSetComplete,true);
 assert.equal(r.proof.certified,false);
});
test("alternate predicate uses identical result-set machinery",async()=>{
 const r=await setParity(unbounded("desc",{predicates:[{kind:"text_any",terms:["medication"]}]}),dataset().map(r=>({...r,note:"medication recorded"})));
 assert.equal(r.proof.certified,true);assert.equal(r.proof.matchingIds.length,4);
});
test("incomplete scan with no observed matches is partial, never exhaustive absence",async()=>{
 const rows=Array.from({length:300},(_,i)=>row("a",i,i===299?"weight 5 kg":"other"));
 const r=await setParity(unbounded(),rows,{pets:["a"]});
 assert.equal(r.proof.matchingIds.length,0);assert.equal(r.proof.certified,false);assert.equal(r.result.coverage.status,"partial");
 await assertUnavailable(r);
});
test("lineage not closed withholds that subject's rows rather than publishing raw candidates",async()=>{
 const r=await setParity(unbounded(),dataset(),{options:{partial:true},legacy:false});
 assert.equal(r.result.records.length,0);assert.equal(r.proof.certified,false);
 assert.ok(r.proof.subjects.every(s=>!s.lineageClosed));
});
test("closed subjects remain usable when another subject's lineage is unresolved",async()=>{
 const ticket=plain(unbounded(),["a","b","c"]),s=store(dataset()),resolve=s.effectiveWindow;
 s.effectiveWindow=async q=>q.petId==="a"?{...(await resolve(q)),lineageClosed:false}:resolve(q);
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.deepEqual(ids(r),["c-2","b-4"]);
 assert.equal(r.coverage.resultSet.subjects.find(s=>s.petId==="b").certified,true);
 assert.equal(r.coverage.status,"partial");
});
test("acquisition failure cannot silently certify the remaining subject set",async()=>{
 const ticket=plain(unbounded(),["a","b","c"]),s=store(dataset()),page=s.page;
 s.page=async q=>{if(q.petId==="a")throw Error("unavailable");return page(q);};
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSet.certified,false);assert.equal(r.coverage.status,"partial");
 assert.ok(r.coverage.resultSet.subjects.find(s=>s.petId==="a").reasons.includes("unavailable"));
});
test("fallback store must exhaust raw history before claiming full matching-set closure",async()=>{
 const ticket=plain(unbounded(),["a"]),s=store(Array.from({length:300},(_,i)=>row("a",i)));
 delete s.effectiveWindow;
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSet.certified,false);assert.equal(r.coverage.resultSet.subjects[0].lineageClosed,false);
});
test("existing completeness requirement is preserved rather than upgraded by adapter",async()=>{
 const p=unbounded();p.outputs.completeness="sufficient";
 const r=await setParity(p,dataset());
 assert.equal(r.ticket.outputs.completeness,"sufficient");
});
for(const relation of ["from","after","before"])test("unbounded semantic anchor "+relation+" is resolved before matching",async()=>{
 const p=unbounded("asc",{operation:"read_since_event",temporal:{from:null,to:null,anchor:{concept:"visit",relation},calendar:null}});
 const r=await setParity(p,[row("a",1),row("a",2,"visit weight"),row("a",3)],{pets:["a"]});
 assert.deepEqual(ids(r.result),relation==="from"?["a-2","a-3"]:relation==="after"?["a-3"]:["a-1"]);
 assert.equal(r.proof.certified,true);
});
test("Labs rejects loss between organ transport and publication payload",async()=>{
 const r=await setParity(unbounded(),dataset());
 assert.throws(()=>buildLabsList(evidence(r.ticket,r.result),r.result.records.slice(1)),/ASK_LABS_RESULT_SET_SNAPSHOT/);
});
test("Labs rejects proof/scope mismatch or dishonest completeness",async()=>{
 const r=await setParity(unbounded(),Array.from({length:40},(_,i)=>row("a",i)),{pets:["a"]});
 for(const change of [c=>c.status="complete",c=>c.resultSet.certified=true,c=>c.resultSet.ordering="desc",c=>c.resultSet.subjectIds.push("other")]){
  const bad=structuredClone(r.result);change(bad.coverage);
  assert.throws(()=>buildLabsList(evidence(r.ticket,bad),bad.records),/ASK_LABS_RESULT_SET_SNAPSHOT/);
 }
});
test("profile authority is not invented by an all-history result-set proof",async()=>{
 const r=await setParity(unbounded(),dataset()),e=evidence(r.ticket,r.result);
 const authority=derivePublicationAuthority(e,r.labs.records);
 assert.ok(authority);assert.deepEqual(new Set(authority.authorizedSourceIds),new Set(r.labs.records.map(row=>row.sourceId)));
 assert.ok(authority.obligations.every(o=>o.authority!=="unavailable" && !o.obligationId.includes("profile")));
 assert.ok(r.labs.records.every(row=>row.sourceId.startsWith("care:")));
});
test("calendar/independent obligations remain outside the adapter",()=>{
 for(const [p,obligations]of [

  [unbounded("asc",{temporal:{from:null,to:null,anchor:null,calendar:"oldest_year"}}),undefined],
  [unbounded(),{evidenceNeedCount:1}]
 ]){
  const t=bindReadTicket(p,["a"]);assert.equal(translateLegacyReadSelection(t,obligations).ticket,t);
 }
 const t=bindReadTicket(unbounded("asc",{operation:"compare",outputs:{strategy:"temporal_endpoints",ordering:"asc",limit:null,completeness:"exhaustive"}}),["a"]);
 assert.equal(translateLegacyReadSelection(t).ticket,t);
});

test("attributed unlinked reports retain provenance but cannot certify a full result set",async()=>{
 const ticket=plain(unbounded(),["a"]),s=store([row("a",1)]),resolve=s.effectiveWindow;
 s.effectiveWindow=async q=>({...await resolve(q),sourceLineage:[{eventId:"a-1",status:"unlinked",authority:"attributed_report"}]});
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.deepEqual(ids(r),["a-1"]);assert.equal(r.coverage.resultSet.certified,false);
 assert.equal(r.coverage.sourceLineage[0].authority,"attributed_report");
 assert.equal(r.coverage.status,"partial");
});

test("production boundary propagates a generic full-set proof without chronology authority",async t=>{
 t.mock.method(Date,"now",()=>Date.parse(scope.asOf));
 const rows=dataset();
 const db={from(name){assert.equal(name,"pet_care_entries");let filtered=[...rows],orders=[],start=0,end=99;
  const q={select(){return q;},eq(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},is(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},
   gte(k,v){filtered=filtered.filter(r=>r[k]>=v);return q;},lt(k,v){filtered=filtered.filter(r=>r[k]<v);return q;},
   order(k,{ascending}){orders.push([k,ascending]);return q;},range(a,b){start=a;end=b;return q;},abortSignal(){return q;},
   returns(){return Promise.resolve({error:null,data:filtered.sort((a,b)=>{for(const[k,asc]of orders){if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;}).slice(start,end+1)});}};
  return q;},
 rpc(name,args){assert.equal(name,"read_ask_history_correction_page");return{abortSignal:async()=>({error:null,data:{claims:[],relations:[],lineage:[],
  sources:rows.filter(r=>args.p_care_ids.includes(r.id)),withheld_source_ids:[],withheld_claim_ids:[],truncated:false}})};}};
 const original=bindReadTicket(unbounded(),["a","b","c"]);
 const context=ticket=>({owner:{userId:"owner"},pet:{id:"a",name:"Alpha",user_id:"owner"},eligiblePets:["a","b","c"].map(id=>({id,name:id,user_id:"owner"})),
  currentMessage:"not interpreted by adapter",conversationTurns:[],historyAccess:{from:scope.from,to:scope.to},
  askInterpretation:{operation:"recall",readOperation:"recall",readOnly:true,petIds:["a","b","c"],request:{mode:"read",readTicket:ticket,quantity:"records"}}});
 const source=context(original),before=JSON.stringify(source);
 const a=await retrieveAskHistory(source,db,["a","b","c"]),b=await retrieveAskHistory(context(plain(unbounded(),["a","b","c"])),db,["a","b","c"]);
 assert.equal(JSON.stringify(source),before);
 assert.deepEqual(a.askInterpretation,b.askInterpretation);
 assert.deepEqual(a.askHistory,b.askHistory);
 assert.equal(a.askInterpretation.request.readTicket.selection,undefined);
 assert.equal(a.askInterpretation.request.readTicket.outputs.strategy,undefined);
 assert.deepEqual(a.askHistory.entries.map(r=>r.id),["a-1","c-2","a-3","b-4"]);
 assert.equal(a.askHistory.coverage.ticketCoverage.resultSet.certified,true);
 assert.equal(a.askHistory.coverage.chronology,undefined);
});

test("complete and represented remain separate in the existing deterministic Labs review",async()=>{
 const {reviewHistoricalAnswer}=await import("../app/lib/intelligence/review-history-narrative.ts");
 const {labsTaskComplete}=await import("../app/lib/intelligence/labs-list.ts");
 const noProvider={responses:{create:async()=>{throw Error("NO_PROVIDER_CALL");}}};
 for(const size of [4,40]){
  const r=await setParity(unbounded(),Array.from({length:size},(_,i)=>row("a",i)),{pets:["a"]});
  const result={labsList:r.labs,evidenceContract:evidence(r.ticket,r.result),
   answer:{title:"Furvise",summary:serializeLabsList(r.labs),sections:[],safetyNote:null},
   relevantContextIds:r.labs.records.map(r=>r.sourceId),applicationActions:[],careActions:[],semanticEvents:[],learnings:[],
   proposedHistoryUpdate:{shouldOffer:false},safetyLevel:"normal",responseMode:"practical_guidance",suggestedFollowUps:[]};
  assert.equal(labsTaskComplete(r.labs),size<=32);
  assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),size<=32);
  if(size>32)await assertUnavailable(r);
 }
});
