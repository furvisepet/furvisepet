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

const globalPlan=(proposal,pets=scope.ownedPetIds)=>{
 const {strategy,...outputs}=proposal.outputs;
 return bindCompositionalReadTicket({...proposal,outputs,selection:{groupBy:[],union:[
  {orderBy:[{field:"event_at",direction:outputs.ordering}],take:{count:outputs.limit,per:"result"}}
 ]}},pets);
};
const represented=result=>result.records.map(r=>({id:r.id,petId:r.pet_profile_id}));
async function globalParity({direction="desc",count=3,rows,options={},patch={},pets=["a","b","c"],oldParity=true}){
 const p=input("chronological",direction,count,patch),old=bindReadTicket(p,pets);
 const translated=translateLegacyReadSelection(old),nativeTicket=globalPlan(p,pets);
 assert.equal(translated.translated,true);assert.deepEqual(translated.ticket,nativeTicket);
 const a=await retrieveReadTicket(translated.ticket,scope,store(rows,options));
 const b=await retrieveReadTicket(nativeTicket,scope,store(rows,options));
 assert.deepEqual(a,b);
 assert.deepEqual(selectionPublication(translated.ticket,a.coverage,represented(a)),selectionPublication(nativeTicket,b.coverage,represented(b)));
 const al=buildLabsList(evidence(translated.ticket,a),a.records),bl=buildLabsList(evidence(nativeTicket,b),b.records);
 assert.deepEqual(derivePublicationAuthority(evidence(translated.ticket,a),al.records),derivePublicationAuthority(evidence(nativeTicket,b),bl.records));
 assert.deepEqual(al,bl);assert.equal(serializeLabsList(al),serializeLabsList(bl));
 if(oldParity){
   const oldStore=store(rows,options);
   oldStore.effective=async acquired=>({records:[...acquired.filter(r=>!options.deleted?.includes(r.id)&&r.id!==options.correction?.replaces),
     ...(options.correction?[options.correction.record]:[])],reliable:true});
   const legacy=await retrieveReadTicket(old,scope,oldStore);
   assert.deepEqual(a.records,legacy.records,"old fully acquired execution preserves the same effective selected facts/order");
 }
 return {ticket:nativeTicket,result:a,publication:selectionPublication(nativeTicket,a.coverage,represented(a)),
   authority:derivePublicationAuthority(evidence(nativeTicket,a),al.records),labs:al};
}
const mixed=()=>[row("a",1),row("a",7),row("b",2),row("b",6),row("c",3),row("c",5)];
for(const [direction,count]of [["desc",1],["desc",3],["asc",4]])test("result-level "+direction+" "+count+" has adapter/native/full-legacy record parity",async()=>{
 const rows=mixed(),r=await globalParity({direction,count,rows});
 assert.deepEqual(r.result.records.map(r=>r.id),[...rows].sort((a,b)=>direction==="asc"?eventOrder(a,b):eventOrder(b,a)).slice(0,count).map(r=>r.id));
 assert.equal(r.publication.complete,true);assert.equal(r.result.coverage.resultSelection[0].certified,true);
 assert.deepEqual(r.authority.authorizedSourceIds,[...new Set(r.publication.selectedEventIds.map(id=>"care:"+id))]);
});
test("subject permutations do not affect selection, joint proof, or allocation",async()=>{
 let first;
 for(const pets of [["a","b","c"],["c","a","b"],["b","c","a"]]){
   const r=await globalParity({rows:mixed(),pets});
   if(first)assert.deepEqual(r.result,first);else first=r.result;
 }
});
test("non-winning subject is not reported as having no matching history",async()=>{
 const r=await globalParity({rows:mixed(),count:1});
 assert.deepEqual(r.publication.certificates.map(c=>c.subjectId),["a"]);
 assert.doesNotMatch(serializeLabsList(r.labs),/No matching records/);
 assert.equal(r.result.coverage.resultSelection[0].frontiers.length,3);
});
test("empty subject is an exhausted competing stream, not erased",async()=>{
 const r=await globalParity({rows:mixed().filter(r=>r.pet_profile_id!=="b")});
 assert.equal(r.result.coverage.resultSelection[0].frontiers.find(f=>f.petId==="b").exhausted,true);
 assert.equal(r.publication.complete,true);
});
test("all empty streams certify only empty bounded selection, not exhaustive history claims",async()=>{
 const r=await globalParity({rows:[]});
 assert.equal(r.result.coverage.resultSelection[0].status,"complete_empty");assert.equal(r.publication.complete,true);
});
test("timestamp ties reuse creation and stable ID ordering",async()=>{
 const rows=["a","b","c"].flatMap(pet=>[1,2,3].map(i=>({...row(pet,4),id:pet+i,created_at:at(i)})));
 const r=await globalParity({rows,count:4});
 assert.deepEqual(r.result.records.map(r=>r.id),[...rows].sort((a,b)=>eventOrder(b,a)).slice(0,4).map(r=>r.id));
});
test("closed correction removes apparent global winner before ranking",async()=>{
 const r=await globalParity({rows:mixed(),count:1,options:{correction:{replaces:"a-7",record:{...row("a",0),id:"corrected"}}}});
 assert.deepEqual(r.result.records.map(r=>r.id),["b-6"]);
});
test("replacement outside immediate page can become global winner",async()=>{
 const rows=Array.from({length:60},(_,i)=>row("a",i)).concat(row("b",40),row("c",30));
 const r=await globalParity({rows,count:1,options:{correction:{replaces:"a-1",record:{...row("a",80),id:"outside-correction"}}}});
 assert.deepEqual(r.result.records.map(r=>r.id),["outside-correction"]);
 assert.ok(r.result.coverage.effectiveStream.find(s=>s.petId==="a").acquiredIds.length<60);
});
test("tombstoned apparent winner cannot win",async()=>{
 const r=await globalParity({rows:mixed(),count:1,options:{deleted:["a-7"]}});
 assert.deepEqual(r.result.records.map(r=>r.id),["b-6"]);
});
test("one unresolved replacement closure blocks the entire global obligation",async()=>{
 const r=await globalParity({rows:mixed(),options:{partial:true},oldParity:false});
 assert.equal(r.publication.complete,false);assert.ok(r.authority);
 assert.ok(r.authority.obligations.every(o=>o.authority==="unavailable"));assert.deepEqual(r.authority.authorizedSourceIds,[]);
 assert.ok(r.result.coverage.resultSelection[0].reasons.includes("lineage_not_closed"));
});
test("one failed competing subject blocks even when N winners exist elsewhere",async()=>{
 const ticket=globalPlan(input("chronological","desc",1)),s=store(mixed()),page=s.page;
 s.page=async q=>{if(q.petId==="c")throw Error("unavailable");return page(q);};
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.ok(r.records.length);assert.equal(r.coverage.resultSelection[0].certified,false);
 assert.equal(selectionPublication(ticket,r.coverage,represented(r)).complete,false);
});
const {retrieveEffectiveSelection}=await import("../app/lib/furvise-brain/effective-selection.ts");
test("bounded acquisition cannot prove cutoff and never starves the third subject",async()=>{
 const rows=["a","b","c"].flatMap(p=>Array.from({length:50},(_,i)=>({...row(p,4),id:p+i,created_at:at(i)})));
 const ticket=globalPlan(input("chronological","desc",1)),s=store(rows);
 const r=await retrieveEffectiveSelection(ticket,scope,s,{pages:1,pageSize:6,records:32,chars:18000});
 assert.deepEqual([...new Set(s.calls.map(c=>c.petId))],["a","b","c"]);
 assert.equal(r.coverage.resultSelection[0].certified,false);
 assert.ok(r.coverage.resultSelection[0].reasons.includes("result_cutoff_unproven"));
});
test("unrepresentable subject cohort gets no privileged prefix",async()=>{
 const ticket=globalPlan(input("chronological","desc",1)),s=store(mixed());
 const r=await retrieveEffectiveSelection(ticket,scope,s,{pages:1,pageSize:2,records:32,chars:18000});
 assert.equal(s.calls.length,0);assert.equal(r.coverage.resultSelection[0].certified,false);
});
test("directional frontiers stop losing subjects without scanning lifetimes",async()=>{
 const rows=["a","b","c"].flatMap((p,j)=>Array.from({length:1000},(_,i)=>row(p,i+j*1000)));
 const ticket=globalPlan(input("chronological","desc",1)),s=store(rows);
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSelection[0].certified,true);
 assert.equal(s.calls.length,3);assert.ok(s.calls.reduce((n,c)=>n+c.limit,0)<=6);
 assert.equal(r.coverage.status,"partial");
});
test("output transport limit cannot redefine semantic result take",async()=>{
 const ticket=globalPlan(input("chronological","desc",3));
 const capped={...ticket,outputs:{...ticket.outputs,limit:1}};
 const r=await retrieveReadTicket(capped,scope,store(mixed()));
 assert.equal(r.coverage.resultSelection[0].selectedIds.length,3);assert.equal(r.records.length,1);
 assert.equal(r.coverage.resultSelection[0].certified,false);
 assert.ok(r.coverage.resultSelection[0].reasons.includes("required_selection_not_retained"));
 assert.equal(selectionPublication(capped,r.coverage,represented(r)).complete,false);
});
test("global record cap blocks full certification rather than changing N",async()=>{
 const r=await globalParity({rows:["a","b","c"].flatMap((p,j)=>Array.from({length:20},(_,i)=>row(p,i+j*20))),count:40});
 assert.equal(r.result.records.length,32);assert.equal(r.result.coverage.resultSelection[0].selectedIds.length,40);
 assert.equal(r.publication.complete,false);
});
test("oversized selected row remains a required missing member",async()=>{
 const r=await globalParity({rows:[...mixed(),row("a",9,"weight "+"x".repeat(19000))],count:3});
 assert.equal(r.result.coverage.resultSelection[0].certified,false);
 assert.ok(r.result.coverage.resultSelection[0].selectedIds.includes("a-9"));
});
test("alternate generic predicate and explicit window use the same result path",async()=>{
 const r=await globalParity({rows:mixed().map(r=>({...r,note:"medication recorded"})),patch:{
  predicates:[{kind:"text_any",terms:["medication"]}],temporal:{from:at(2),to:at(7),anchor:null,calendar:null}}});
 assert.deepEqual(r.result.records.map(r=>r.id),["b-6","c-5","c-3"]);
});
test("single subject native result-level take remains valid",async()=>{
 const ticket=globalPlan(input("chronological","asc",2),["a"]),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 assert.deepEqual(r.records.map(r=>r.id),["a-1","a-7"]);assert.equal(r.coverage.resultSelection[0].certified,true);
});
test("output presentation ordering does not redefine a single result clause",async()=>{
 const ticket=globalPlan(input("chronological","desc",3)),r=await retrieveReadTicket({...ticket,outputs:{...ticket.outputs,ordering:"asc"}},scope,store(mixed()));
 assert.deepEqual(r.records.map(r=>r.id),["a-7","b-6","c-5"]);
});
test("exhaustive obligation remains limited with certified bounded global selection",async()=>{
 const p=input("chronological","desc",1);p.outputs.completeness="exhaustive";
 const ticket=globalPlan(p),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 assert.equal(r.coverage.resultSelection[0].certified,true);assert.equal(r.coverage.status,"partial");
 assert.match(serializeLabsList(buildLabsList(evidence(ticket,r),r.records)),/cannot establish an exhaustive list/);
});
test("missing selected publication row invalidates the whole joint selection",async()=>{
 const ticket=globalPlan(input()),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 const p=selectionPublication(ticket,r.coverage,[]);
 assert.equal(p.complete,false);assert.equal(p.transportValid,false);assert.deepEqual(p.selectedEventIds,[]);
});
test("result receipt cannot be replaced with independently certified subject receipts",async()=>{
 const ticket=globalPlan(input()),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 delete r.coverage.resultSelection;
 assert.equal(selectionPublication(ticket,r.coverage,represented(r)).complete,false);
});
test("joint receipt rejects missing competing subject or altered cardinality",async()=>{
 const ticket=globalPlan(input()),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 for(const change of [c=>c.subjectIds.pop(),c=>c.frontiers.pop(),c=>c.count++,c=>c.frontiers[0].lineageClosed=false]){
  const coverage=structuredClone(r.coverage);change(coverage.resultSelection[0]);
  assert.equal(selectionPublication(ticket,coverage,represented(r)).complete,false);
 }
});
test("one global union clause cannot borrow another clause's proof",async()=>{
 const ticket=globalPlan(input("chronological","desc",1));
 const both={...ticket,outputs:{...ticket.outputs,limit:null},selection:{...ticket.selection,union:[...ticket.selection.union,{orderBy:[{field:"event_at",direction:"asc"}],take:{count:1,per:"result"}}]}};
 const r=await retrieveReadTicket(both,scope,store(mixed()));
 assert.deepEqual(r.coverage.resultSelection.map(c=>c.selectedIds),[["a-7"],["a-1"]]);
 assert.equal(selectionPublication(both,r.coverage,represented(r)).complete,true);
});
test("empty grouping and grouped take are incompatible",()=>{
 const p=input();delete p.outputs.strategy;
 assert.throws(()=>bindCompositionalReadTicket({...p,selection:{groupBy:[],union:[clause("desc")]}},["a"]),
 e=>e.cause?.rule==="result_count_1_to_100");
});

test("partial lineage on a losing subject still blocks a seemingly obvious winner",async()=>{
 const ticket=globalPlan(input()),s=store(mixed()),effective=s.effectiveWindow;
 s.effectiveWindow=async q=>{const proof=await effective(q);return q.petId==="c"?{...proof,lineageClosed:false,reasons:["closure_incomplete"]}:proof;};
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.ok(r.records.some(r=>r.id==="a-7"));
 assert.equal(r.coverage.resultSelection[0].certified,false);
 const labs=buildLabsList(evidence(ticket,r),r.records),authority=derivePublicationAuthority(evidence(ticket,r),labs.records);
 assert.ok(authority);assert.ok(authority.obligations.every(o=>o.authority==="unavailable"));assert.deepEqual(authority.authorizedSourceIds,[]);
});
test("linked-source uncertainty cannot satisfy a joint frontier",async()=>{
 const ticket=globalPlan(input()),s=store(mixed()),effective=s.effectiveWindow;
 s.effectiveWindow=async q=>{const proof=await effective(q);return q.petId==="c"?{...proof,sourceLineage:[{eventId:"c-3",status:"uncertain",authority:"attributed_report"}]}:proof;};
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSelection[0].certified,false);
 assert.ok(r.coverage.resultSelection[0].reasons.includes("unresolved_source_lineage"));
});
test("corrected predicate is applied before the global ranking",async()=>{
 const r=await globalParity({rows:mixed(),count:1,options:{correction:{replaces:"a-7",record:{...row("a",7,"food instead"),id:"corrected-topic"}}}});
 assert.deepEqual(r.result.records.map(r=>r.id),["b-6"]);
});
test("selected source projections cannot add an event outside the joint receipt",async()=>{
 const ticket=globalPlan(input("chronological","desc",3)),r=await retrieveReadTicket(ticket,scope,store(mixed()));
 const coverage=structuredClone(r.coverage),g=coverage.groups.find(g=>g.petId==="b");
 g.clauses[0].ids.push("b-2");g.selectedIds.push("b-2");g.retainedIds.push("b-2");
 coverage.selection.retainedIds.push("b-2");coverage.effectiveStream.find(s=>s.petId==="b").certifiedSelectedIds.push("b-2");
 const publication=selectionPublication(ticket,coverage,[...represented(r),{id:"b-2",petId:"b"}]);
 assert.equal(publication.complete,false);assert.deepEqual(publication.selectedEventIds,[]);
});
test("profile facts cannot replace jointly certified historical result sources",async()=>{
 const ticket=globalPlan(input("chronological","desc",3)),r=await retrieveReadTicket(ticket,scope,store(mixed())),e=evidence(ticket,r);
 e.represented.push({sourceId:"profile:a:weight",petId:"a",sourceType:"profile",field:"weight",text:"weight 7 kg",start:0,end:11});
 const labs=buildLabsList(e,r.records),a=derivePublicationAuthority(e,labs.records);
 assert.ok(a);assert.deepEqual(new Set(a.authorizedSourceIds),new Set(labs.records.map(row=>row.sourceId)));
 assert.ok(a.authorizedSourceIds.length);assert.ok(a.authorizedSourceIds.every(id=>id.startsWith("care:")));
 const {publicationClaimFailures}=await import("../app/lib/intelligence/publication-authority.ts");
 const obligation=a.obligations.find(o=>o.subjectId==="a");
 assert.ok(publicationClaimFailures(e,[{obligationId:obligation.obligationId,text:"weight 7 kg",sourceIds:["profile:a:weight"]}])
   .some(x=>x.startsWith("publication_source_outside_obligation")));
});
test("result-level exhaustive fallback is conservative without a directional effective store",async()=>{
 const ticket=globalPlan(input("chronological","desc",3)),s=store(mixed());delete s.effectiveWindow;
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSelection[0].certified,true);
 assert.equal(selectionPublication(ticket,r.coverage,represented(r)).complete,true);
});
test("bounded raw fallback never certifies a raw ranking frontier",async()=>{
 const ticket=globalPlan(input("chronological","desc",1)),rows=["a","b","c"].flatMap((p,j)=>Array.from({length:500},(_,i)=>row(p,i+j*500)));
 const s=store(rows);delete s.effectiveWindow;
 const r=await retrieveReadTicket(ticket,scope,s);
 assert.equal(r.coverage.resultSelection[0].certified,false);
 assert.equal(selectionPublication(ticket,r.coverage,represented(r)).complete,false);
});
test("semantic anchor is resolved before a global result selection",async()=>{
 const p=input("chronological","desc",1,{operation:"read_since_event",temporal:{from:null,to:null,anchor:{concept:"visit",relation:"after"},calendar:null}});
 const ticket=globalPlan(p,["a"]),r=await retrieveReadTicket(ticket,scope,store([row("a",1,"visit weight"),row("a",2),row("a",3)]));
 assert.deepEqual(r.records.map(r=>r.id),["a-3"]);assert.equal(r.coverage.anchors[0].eventId,"a-1");
 assert.equal(r.coverage.resultSelection[0].certified,true);
});

test("multi-subject production boundary propagates one result-level ticket and joint receipt",async t=>{
 t.mock.method(Date,"now",()=>Date.parse(scope.asOf));
 const rows=mixed();
 const db={from(name){assert.equal(name,"pet_care_entries");let filtered=[...rows],orders=[],start=0,end=99;
  const q={select(){return q;},eq(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},is(k,v){filtered=filtered.filter(r=>r[k]===v);return q;},
   gte(k,v){filtered=filtered.filter(r=>r[k]>=v);return q;},lt(k,v){filtered=filtered.filter(r=>r[k]<v);return q;},
   order(k,{ascending}){orders.push([k,ascending]);return q;},range(a,b){start=a;end=b;return q;},abortSignal(){return q;},
   returns(){return Promise.resolve({error:null,data:filtered.sort((a,b)=>{for(const[k,asc]of orders){if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;}).slice(start,end+1)});}};
  return q;},
 rpc(name,args){assert.equal(name,"read_ask_history_correction_page");return{abortSignal:async()=>({error:null,data:{claims:[],relations:[],lineage:[],
  sources:rows.filter(r=>args.p_care_ids.includes(r.id)),withheld_source_ids:[],withheld_claim_ids:[],truncated:false}})};}};
 const original=bindReadTicket(input("chronological","desc",3),["a","b","c"]);
 const context=ticket=>({owner:{userId:"owner"},pet:{id:"a",name:"Alpha",user_id:"owner"},eligiblePets:["a","b","c"].map(id=>({id,name:id,user_id:"owner"})),
  currentMessage:"not interpreted by adapter",conversationTurns:[],historyAccess:{from:scope.from,to:scope.to},
  askInterpretation:{operation:"recall",readOperation:"recall",readOnly:true,petIds:["a","b","c"],request:{mode:"read",readTicket:ticket,quantity:"records"}}});
 await assert.rejects(retrieveAskHistory(context(original),db,["a","b","c"]),/ASK_CANONICAL_READ_TICKET_REQUIRED/);
 const normalized=translateLegacyReadSelection(original);assert.equal(normalized.translated,true);
 const source=context(normalized.ticket),before=JSON.stringify(source);
 const a=await retrieveAskHistory(source,db,["a","b","c"]),b=await retrieveAskHistory(context(globalPlan(input("chronological","desc",3))),db,["a","b","c"]);
 assert.equal(JSON.stringify(source),before);
 assert.deepEqual(a.askInterpretation,b.askInterpretation);
 assert.deepEqual(a.askHistory,b.askHistory);
 assert.ok(a.askInterpretation.request.readTicket.selection);
 assert.equal(a.askInterpretation.request.readTicket.outputs.strategy,undefined);
 assert.deepEqual(a.askHistory.entries.map(r=>r.id),["a-7","b-6","c-5"]);
 assert.equal(a.askHistory.coverage.ticketCoverage.resultSelection[0].certified,true);
});
