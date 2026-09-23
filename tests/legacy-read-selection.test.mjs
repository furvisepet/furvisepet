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
   request:{mode:"read",quantity:"records",evidenceBasis:"saved_history",readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[],outputFormat:"table"}},
  history:{ticketCoverage:result.coverage,provenance:[],perPet:[],needs:[],candidateIds:represented.map(r=>r.sourceId),
   claimSources:[],excludedIds:[],continuation:[],reasons:[],retrieval:"partial",corrections:"complete"},
  represented,sources:[],losses:[],representation:"complete",verifiedFacts:[],
  completeness:{retrieval:"partial",corrections:"complete",extraction:"complete",grouping:"complete"}};
}
async function parity(proposal,rows,options={}) {
 const original=bindReadTicket(proposal,["a"]), before=JSON.stringify(original);
 const translated=translateLegacyReadSelection(original);
 assert.equal(translated.translated,true);
 const expected=native(proposal);
 assert.deepEqual(translated.ticket,expected);
 assert.equal(JSON.stringify(original),before);
 assert.equal(translateLegacyReadSelection(translated.ticket).ticket,translated.ticket);
 const aStore=store(rows,options),bStore=store(rows,options);
 const a=await retrieveReadTicket(translated.ticket,scope,aStore),b=await retrieveReadTicket(expected,scope,bStore);
 assert.deepEqual(a,b);assert.deepEqual(aStore.calls,bStore.calls);
 const ae=evidence(translated.ticket,a),be=evidence(expected,b);
 assert.deepEqual(selectionPublication(translated.ticket,a.coverage,a.records.map(r=>({id:r.id,petId:r.pet_profile_id}))),
  selectionPublication(expected,b.coverage,b.records.map(r=>({id:r.id,petId:r.pet_profile_id}))));
 const authority=derivePublicationAuthority(ae);
 assert.deepEqual(authority,derivePublicationAuthority(be));
 assert.ok((authority?.authorizedSourceIds || []).every(id=>a.records.some(r=>"care:"+r.id===id)));
 const al=buildLabsList(ae,a.records),bl=buildLabsList(be,b.records);
 assert.deepEqual(al,bl);
 if(al)assert.equal(serializeLabsList(al),serializeLabsList(bl));
 return {ticket:translated.ticket,result:a,authority,labs:al};
}
for(const direction of ["asc","desc"])for(const count of [1,2,5])
 test("single chronological "+direction+" take "+count+" has native authority and publication parity",async()=>{
 const rows=Array.from({length:12},(_,i)=>row("a",i));
 const r=await parity(input("chronological",direction,count),rows);
 assert.deepEqual(r.result.records.map(r=>r.id),[...rows].sort((a,b)=>direction==="asc"?eventOrder(a,b):eventOrder(b,a)).slice(0,count).map(r=>r.id));
 assert.equal(r.ticket.outputs.limit,count,"original output cap retained independently");
 assert.equal(r.ticket.selection.union[0].take.count,count);
});
for(const direction of ["asc","desc"])test("single endpoint union "+direction+" matches native boundary facts",async()=>{
 const r=await parity(input("temporal_endpoints",direction,2),[0,1,2,3].map(i=>row("a",i)));
 assert.deepEqual(r.result.records.map(r=>r.id),direction==="asc"?["a-0","a-3"]:["a-3","a-0"]);
});
for(const strategy of ["chronological","temporal_endpoints"]) {
 const proposal=input(strategy,"desc",strategy==="chronological"?1:2);
 for(const [name,rows,options]of [
  ["missing evidence",[],{}],
  ["one record deduplicates boundaries",[row("a",0)],{}],
  ["corrected endpoint",[row("a",0),row("a",1),row("a",2)],{correction:{replaces:"a-2",record:{...row("a",2,"weight 9 kg corrected"),id:"correction"}}}],
  ["deleted endpoint",[row("a",0),row("a",1),row("a",2)],{deleted:["a-2"]}],
  ["partial lineage",[row("a",0),row("a",1)],{partial:true}],
  ["unavailable retrieval",[row("a",0)],{unavailable:true}],
  ["transport character pressure",[row("a",0,"weight "+"x".repeat(19000)),row("a",1,"weight "+"x".repeat(19000))],{}],
 ])test(strategy+" "+name+" preserves native certificates and blocking",async()=>{
   const r=await parity(proposal,rows,options);
   if(options.partial||options.unavailable||name==="transport character pressure")assert.equal(r.authority?.authorizedSourceIds.length ?? 0,0);
 });
}
test("alternate predicate and explicit window reuse exactly the same adapter",async()=>{
 const p=input();p.predicates=[{kind:"text_any",terms:["food"]}];p.temporal={from:at(1),to:at(4),anchor:null,calendar:null};
 const r=await parity(p,[0,1,2,3,4].map(i=>row("a",i,"food recorded")));
 assert.deepEqual(r.result.records.map(r=>r.id),["a-3"]);
});
test("exhaustive obligation is preserved, never upgraded by selected certificates",async()=>{
 const p=input();p.outputs.completeness="exhaustive";
 const r=await parity(p,Array.from({length:12},(_,i)=>row("a",i)));
 assert.equal(r.ticket.outputs.completeness,"exhaustive");
 assert.equal(r.result.coverage.status,"partial");
 assert.match(serializeLabsList(r.labs),/cannot establish an exhaustive list/);
});
test("global record pressure keeps semantic take separate from transport/certification",async()=>{
 const r=await parity(input("chronological","asc",40),Array.from({length:50},(_,i)=>row("a",i)));
 assert.equal(r.ticket.selection.union[0].take.count,40);assert.equal(r.result.records.length,32);
 assert.ok(r.result.coverage.groups[0].reasons.includes("required_selection_not_retained"));
});
test("multi-subject endpoints retain legacy global reservation and interior fill",async()=>{
 const p=input("temporal_endpoints","desc",4),rows=[0,1,2,3,4].map(i=>row("a",i));
 for(const subjects of [["a","b"],["b","a"]]){
  const ticket=bindReadTicket(p,subjects),t=translateLegacyReadSelection(ticket);
  assert.equal(t.ticket,ticket);assert.equal(t.reason,"boundary_facts_not_established");
  const old=await retrieveReadTicket(ticket,scope,store(rows)),composed=await retrieveReadTicket(native(p,subjects),scope,store(rows));
  assert.equal(old.records.length,4);
  assert.equal(composed.records.length,2);
 }
});
test("multi-subject chronological translates to a global take, never a per-subject quota",async()=>{
 const p=input(),rows=[row("a",4),row("b",3)];
 for(const subjects of [["a","b"],["b","a"]]){
  const ticket=bindReadTicket(p,subjects),t=translateLegacyReadSelection(ticket);
  assert.equal(t.reason,"equivalent_result_selection");
  assert.deepEqual(t.ticket.selection.groupBy,[]);
  assert.equal(t.ticket.selection.union[0].take.per,"result");
  const result=await retrieveReadTicket(t.ticket,scope,store(rows));
  assert.deepEqual(result.records.map(r=>r.id),["a-4"]);
  const perGroup=native(p,subjects);
  const groups=await retrieveReadTicket({...perGroup,outputs:{...perGroup.outputs,limit:null}},scope,store(rows));
  assert.equal(groups.records.length,2);
 }
});
for(const [name,p,reason]of [
 ["endpoint interiors",input("temporal_endpoints","desc",3),"endpoint_interior_or_truncation_semantics"],
 ["endpoint global truncation",input("temporal_endpoints","desc",1),"endpoint_interior_or_truncation_semantics"],
 ["endpoint hints",input("temporal_endpoints","desc",2,{searchHints:["food"]}),"legacy_hint_ranking"],
 ["oldest calendar year",input("chronological","asc",null,{temporal:{from:null,to:null,anchor:null,calendar:"oldest_year"}}),"calendar_semantics"],
 ["calendar samples",input("calendar_samples","asc",2),"strategy_outside_compatibility_cut"],
 ["event candidates",input("event_candidates","asc",2),"strategy_outside_compatibility_cut"],
])test(name+" stays on unchanged legacy ticket",()=>{
 const ticket=bindReadTicket(p,["a"]),result=translateLegacyReadSelection(ticket);
 assert.equal(result.ticket,ticket);assert.equal(result.translated,false);assert.equal(result.reason,reason);
});
test("native conflict rejection remains authoritative before compatibility",()=>{
 const p=input();assert.throws(()=>bindCompositionalReadTicket({...p,selection:{groupBy:["subject"],union:[clause("desc")]}},["a"]),
 e=>e.cause?.rule==="incompatible_with_legacy_selector");
});
test("production retrieval boundary propagates normalized ticket into downstream evidence",async t=>{
 t.mock.method(Date,"now",()=>Date.parse(scope.asOf));
 const rows=Array.from({length:6},(_,i)=>row("a",i));
 const db={from(name){assert.equal(name,"pet_care_entries");let filtered=[...rows],orders=[],start=0,end=99;
  const q={select(){return q;},eq(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},is(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},
   gte(k,v){filtered=filtered.filter(r=>r[k]>=v);return q;},lt(k,v){filtered=filtered.filter(r=>r[k]<v);return q;},
   order(k,{ascending}){orders.push([k,ascending]);return q;},range(a,b){start=a;end=b;return q;},abortSignal(){return q;},
   returns(){return Promise.resolve({error:null,data:filtered.sort((a,b)=>{for(const[k,asc]of orders){if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;}).slice(start,end+1)});}};
  return q;},
 rpc(name,args){assert.equal(name,"read_ask_history_correction_page");return{abortSignal:async()=>({error:null,data:{claims:[],relations:[],lineage:[],
  sources:rows.filter(r=>args.p_care_ids.includes(r.id)),withheld_source_ids:[],withheld_claim_ids:[],truncated:false}})};}};
 const original=bindReadTicket(input(),["a"]);
 const context=ticket=>({owner:{userId:"owner"},pet:{id:"a",name:"Alpha",user_id:"owner"},eligiblePets:[{id:"a",name:"Alpha",user_id:"owner"}],
  currentMessage:"not interpreted by adapter",conversationTurns:[],historyAccess:{from:scope.from,to:scope.to},
  askInterpretation:{operation:"recall",readOperation:"recall",readOnly:true,petIds:["a"],request:{mode:"read",readTicket:ticket,quantity:"records"}}});
 const source=context(original),before=JSON.stringify(source);
 const a=await retrieveAskHistory(source,db,["a"]),b=await retrieveAskHistory(context(native(input())),db,["a"]);
 assert.equal(JSON.stringify(source),before);
 assert.deepEqual(a.askInterpretation,b.askInterpretation);
 assert.deepEqual(a.askHistory,b.askHistory);
 assert.ok(a.askInterpretation.request.readTicket.selection);
 assert.equal(a.askInterpretation.request.readTicket.outputs.strategy,undefined);
 assert.deepEqual(a.askHistory.entries.map(r=>r.id),["a-5"]);
});

test("independent legacy envelope obligations are not silently subsumed by selection",()=>{
 const ticket=bindReadTicket(input(),["a"]);
 const result=translateLegacyReadSelection(ticket,{evidenceNeedCount:1});
 assert.equal(result.ticket,ticket);assert.equal(result.translated,false);
 assert.equal(result.reason,"independent_legacy_evidence_obligations");
});

for(const relation of ["from","after","before"])test("semantic anchor "+relation+" is preserved before selection",async()=>{
 const p=input("chronological","asc",1,{operation:"read_since_event",temporal:{from:null,to:null,anchor:{concept:"visit",relation},calendar:null}});
 const r=await parity(p,[row("a",0),row("a",1,"visit weight"),row("a",2)]);
 assert.deepEqual(r.result.records.map(r=>r.id),[relation==="from"?"a-1":relation==="after"?"a-2":"a-0"]);
 assert.equal(r.result.coverage.anchors[0].eventId,"a-1");
});

const {validateAskRequest}=await import("../app/lib/intelligence/ask-request-contract.ts");
const {createAskEvidenceContract}=await import("../app/lib/intelligence/ask-evidence.ts");
const {generateContextAwareAskResponse}=await import("../app/lib/ai/ask-reasoning.ts");
const finitePets=["a","b"].map((id,i)=>({id,name:["Alpha","Beta"][i],user_id:"owner",species:"dog"}));
function finiteProposal(selection="earliest",limit=null,completeness="sufficient",petNames=["Alpha"],topic="observation"){
 const question="Retrieve the requested saved records.";
 const context={owner:{userId:"owner"},eligiblePets:finitePets,pet:finitePets[0],currentMessage:question,
  currentTurn:{id:"u1",role:"user",text:question},conversationTurns:[],timeZone:"UTC"};
 const proposal={version:"ask-request.v2",mode:"read",question,requirements:[],referenceTurnIds:[],
  evidenceBasis:"saved_history",scope:"named",petNames,operation:"recall",selection,quantity:"measurement",
  topic:"history",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
  readTicket:{...input("chronological",selection==="latest"?"desc":"asc",limit),
   selection:null,predicates:[{kind:"text_any",terms:[topic]}],
   outputs:{strategy:"chronological",ordering:selection==="latest"?"desc":"asc",limit,completeness}}};
 return {context,proposal};
}
for(const [semantic,direction]of [["earliest","asc"],["latest","desc"]])
 test("typed "+semantic+" with null legacy cap binds finite selection before authority",()=>{
  for(const topic of ["observation","food","medication"]){
   const {context,proposal}=finiteProposal(semantic,null,"sufficient",["Alpha"],topic);
   const before=JSON.stringify(proposal),r=validateAskRequest(proposal,context),ticket=r.request.readTicket;
   assert.deepEqual(ticket.selection,{groupBy:["subject"],union:[clause(direction)]});
   assert.equal(ticket.outputs.strategy,undefined);assert.equal(ticket.outputs.limit,null);
   assert.equal(ticket.outputs.completeness,"sufficient");assert.equal(Object.isFrozen(ticket),true);
   assert.deepEqual(ticket.predicates,proposal.readTicket.predicates);
   assert.equal(JSON.stringify(proposal),before);
   assert.equal(translateLegacyReadSelection(ticket).ticket,ticket);
  }
 });
test("typed finite endpoints group all bound subjects without inventing ownership",()=>{
 const {context,proposal}=finiteProposal("earliest",null,"sufficient",["Alpha","Beta"]);
 const ticket=validateAskRequest(proposal,context).request.readTicket;
 assert.deepEqual(ticket.subjects.petIds,["a","b"]);
 assert.deepEqual(ticket.selection,{groupBy:["subject"],union:[clause("asc")]});
 assert.throws(()=>validateAskRequest({...proposal,petNames:["Unknown"]},context));
});
test("typed top N preserves its explicit legacy cardinality and global versus single-subject scope",()=>{
 for(const names of [["Alpha"],["Alpha","Beta"]])for(const count of [2,5]){
  const {context,proposal}=finiteProposal("latest",count,"sufficient",names);
  const ticket=validateAskRequest(proposal,context).request.readTicket;
  assert.equal(ticket.selection.union[0].take.count,count);
  assert.equal(ticket.selection.union[0].take.per,names.length===1?"group":"result");
  assert.equal(ticket.outputs.limit,count);
 }
});
test("genuine unbounded chronology stays unbounded",()=>{
 for(const semantic of ["summary","period"]){
  const {context,proposal}=finiteProposal(semantic,null,"exhaustive");
  const ticket=validateAskRequest(proposal,context).request.readTicket;
  assert.equal(ticket.selection,undefined);assert.equal(ticket.outputs.limit,null);
  const translated=translateLegacyReadSelection(ticket);
  assert.equal(translated.ticket.selection,undefined);
  assert.equal(translated.ticket.outputs.completeness,"exhaustive");
 }
});
test("finite normalization cannot weaken exhaustive propositions or infer endpoints for counts",()=>{
 for(const semantic of ["earliest","latest","summary","period"]){
  const {context,proposal}=finiteProposal(semantic,null,"exhaustive");
  const ticket=validateAskRequest(proposal,context).request.readTicket;
  assert.equal(ticket.outputs.completeness,"exhaustive");
 }
 const ticket=bindReadTicket(input("chronological","asc",null,{outputs:{strategy:"chronological",ordering:"asc",limit:null,completeness:"exhaustive"}}),["a"]);
 for(const operation of ["count","episode","comparison"]){
  const translated=translateLegacyReadSelection(ticket,{evidenceNeedCount:0,readIntent:{
   selection:"earliest",operation,quantity:"records",referenceTurnCount:0,requirementCount:0,
   hasProfileFields:false,hasProjection:false,hasRecordSelection:false,temporalScope:"historical"}});
  assert.equal(translated.ticket.selection,undefined);
  assert.equal(translated.ticket.outputs.completeness,"exhaustive");
 }
});
test("finite conflicting calendar cannot escape binding as an unbounded fallback",()=>{
 const {context,proposal}=finiteProposal();
 proposal.readTicket.temporal.calendar="oldest_year";
 assert.throws(()=>validateAskRequest(proposal,context),/finite_selection/);
});
for(const [semantic,strategy,limit,direction,index]of [
 ["earliest","chronological",null,"asc",0],
 ["earliest",null,1,"asc",0],
 ["latest",null,1,"desc",399],
])test("normalized "+semantic+" strategy "+strategy+" cap "+limit+" reaches Lungs evidence certificates and deterministic Labs with partial global history",async()=>{
 const {context,proposal}=finiteProposal(semantic,limit);
 proposal.readTicket.outputs.strategy=strategy;
 const interpretation=validateAskRequest(proposal,context),ticket=interpretation.request.readTicket;
 const rows=Array.from({length:400},(_,i)=>row("a",i,"observation "+i));
 const db=store(rows);
 const result=await retrieveReadTicket(ticket,scope,db);
 assert.ok(db.calls.every(q=>q.ordering===direction));
 assert.equal(result.coverage.status,"partial");
 assert.deepEqual(result.records.map(r=>r.id),["a-"+index]);
 const legacyEvidence=evidence(ticket,result);
 const contract=createAskEvidenceContract({...context,askInterpretation:interpretation,
  careEntries:result.records,selectedCareEntries:result.records,
  askHistory:{entries:result.records,originals:result.records,coverage:legacyEvidence.history}},["a"]);
 assert.equal(contract.interpretation.request.readTicket,ticket);
 contract.represented=legacyEvidence.represented;
 const before=structuredClone(result.coverage);
 const proof=selectionPublication(ticket,contract.history.ticketCoverage,result.records.map(r=>({id:r.id,petId:r.pet_profile_id})));
 assert.equal(proof.complete,true);assert.equal(proof.transportValid,true);
 assert.ok(proof.certificates.every(c=>c.certified&&c.lineageClosed));
 const response=await generateContextAwareAskResponse({evidenceContract:contract,profiles:finitePets,
  careEntries:result.records,memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],
  question:context.currentMessage,requestId:"offline-normalized-endpoint",locale:"en-CA",
  client:{responses:{create:async()=>{throw Error("NO_PUBLICATION_PROVIDER");}}}});
 assert.equal(response.model,"server-labs-list");
 assert.deepEqual(response.labsList.ticket,ticket);
 const authority=derivePublicationAuthority(contract,response.labsList.records);
 assert.equal(authority.transportValid,true);
 assert.deepEqual(authority.authorizedSourceIds,["care:a-"+index]);
 assert.deepEqual(response.labsList.records.map(r=>({id:r.id,petId:r.petId,event_at:r.event_at,body:r.body})),
  result.records.map(r=>({id:r.id,petId:r.pet_profile_id,event_at:r.occurred_at,body:r.note})));
 assert.ok(response.answer.summary.includes("observation "+index));
 assert.doesNotMatch(response.answer.summary,/exhaustive|partial results|history search is incomplete/);
 assert.deepEqual(result.coverage,before);
});

test("independent envelope obligation cannot be dropped to normalize a finite endpoint",()=>{
 const {context,proposal}=finiteProposal();
 const question="Retrieve the requested observation. Also retrieve the medication records.";
 context.currentMessage=question;context.currentTurn.text=question;proposal.question=question;
 proposal.evidenceNeeds=[{quote:"Also retrieve the medication records.",sourceTurnId:null,
  petNames:["Alpha"],terms:["medication"],order:"context"}];
 const before=JSON.stringify(proposal);
 const ticket=bindReadTicket(proposal.readTicket.selection===null
  ? Object.fromEntries(Object.entries(proposal.readTicket).filter(([key])=>key!=="selection"))
  : proposal.readTicket,["a"]);
 const translated=translateLegacyReadSelection(ticket,{evidenceNeedCount:1,readIntent:{
  selection:"earliest",operation:"recall",quantity:"measurement",referenceTurnCount:0,requirementCount:0,
  hasProfileFields:false,hasProjection:false,hasRecordSelection:false,temporalScope:"historical"}});
 assert.equal(translated.translated,false);
 assert.equal(translated.reason,"independent_legacy_evidence_obligations");
 assert.equal(translated.ticket,ticket);
 assert.throws(()=>validateAskRequest(proposal,context),/finite_selection/);
 assert.equal(JSON.stringify(proposal),before);
});

for(const [semantic,direction]of [["earliest","asc"],["latest","desc"]])
 test("typed "+semantic+" null strategy singleton binds the same generic finite endpoint",()=>{
  for(const topic of ["observation","food","medication"])for(const names of [["Alpha"],["Alpha","Beta"]]){
   const {context,proposal}=finiteProposal(semantic,1,"sufficient",names,topic);
   proposal.readTicket.outputs.strategy=null;
   const before=JSON.stringify(proposal),ticket=validateAskRequest(proposal,context).request.readTicket;
   assert.deepEqual(ticket.selection,{groupBy:["subject"],union:[clause(direction)]});
   assert.deepEqual(ticket.outputs,{completeness:"sufficient",ordering:direction,limit:null});
   assert.deepEqual(ticket.subjects.petIds,names.length===1?["a"]:["a","b"]);
   assert.deepEqual(ticket.predicates,proposal.readTicket.predicates);
   assert.deepEqual(ticket.temporal,proposal.readTicket.temporal);
   assert.equal(JSON.stringify(proposal),before);
   assert.equal(translateLegacyReadSelection(ticket).ticket,ticket);
   assert.throws(()=>validateAskRequest({...proposal,petNames:["Unknown"]},context));
  }
 });

test("null strategy is not endpoint intent and cannot erase independent semantics",()=>{
 const ticket=bindReadTicket(input(null,"desc",1),["a"]);
 const intent={selection:"latest",operation:"recall",quantity:"measurement",referenceTurnCount:0,
  requirementCount:0,hasProfileFields:false,hasProjection:false,hasRecordSelection:false,temporalScope:"historical"};
 assert.equal(translateLegacyReadSelection(ticket).ticket,ticket);
 for(const patch of [
  {selection:"summary"},{selection:"period"},{selection:"reference"},
  {operation:"count"},{operation:"existence"},{operation:"absence"},
  {hasProfileFields:true},{hasProjection:true},{hasRecordSelection:true},
  {temporalScope:"current"},{temporalScope:"historical_and_current"},
 ]){
  const result=translateLegacyReadSelection(ticket,{evidenceNeedCount:0,readIntent:{...intent,...patch}});
  assert.equal(result.translated,false);assert.equal(result.ticket,ticket);
 }
 const independent=translateLegacyReadSelection(ticket,{evidenceNeedCount:1,readIntent:intent});
 assert.equal(independent.reason,"independent_legacy_evidence_obligations");
 assert.equal(independent.ticket,ticket);
});

test("null strategy preserves unbounded chronology and exhaustive obligations",()=>{
 for(const selection of ["summary","period"]){
  const {context,proposal}=finiteProposal(selection,null,"exhaustive");
  proposal.readTicket.outputs.strategy=null;
  const ticket=validateAskRequest(proposal,context).request.readTicket;
  assert.equal(ticket.selection,undefined);
  assert.equal(ticket.outputs.limit,null);assert.equal(ticket.outputs.completeness,"exhaustive");
 }
 for(const selection of ["earliest","latest"]){
  const {context,proposal}=finiteProposal(selection,1,"exhaustive");
  proposal.readTicket.outputs.strategy=null;
  const ticket=validateAskRequest(proposal,context).request.readTicket;
  assert.equal(ticket.outputs.completeness,"exhaustive");
  assert.equal(ticket.selection.union[0].take.count,1);
 }
});

test("null strategy endpoint retains calendar and independent-obligation rejection",()=>{
 const {context,proposal}=finiteProposal("latest",1);
 proposal.readTicket.outputs.strategy=null;
 proposal.readTicket.temporal.calendar="oldest_year";
 assert.throws(()=>validateAskRequest(proposal,context));
 proposal.readTicket.temporal.calendar=null;
 const question="Retrieve the requested observation. Also retrieve the medication records.";
 context.currentMessage=question;context.currentTurn.text=question;proposal.question=question;
 proposal.evidenceNeeds=[{quote:"Also retrieve the medication records.",sourceTurnId:null,
  petNames:["Alpha"],terms:["medication"],order:"context"}];
 const before=JSON.stringify(proposal);
 assert.throws(()=>validateAskRequest(proposal,context),/finite_selection/);
 assert.equal(JSON.stringify(proposal),before);
});
