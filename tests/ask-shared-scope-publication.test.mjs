import test from "node:test";
import assert from "node:assert/strict";
import {discoverHistoryBatch} from "../app/lib/ask-read-only/retrieval.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
const pet={id:"pet-a",ownerId:"owner",name:"Juniper",species:"dog",handle:"p1"};
const req=terms=>({kind:"history",pet,terms,from:"2024-01-01",to:"2024-12-31",goal:"relevant_records",orderBy:"event",order:"asc",offset:0});
const notes=Array.from({length:12},(_,i)=>({kind:"history",id:"note-"+i,ownerId:"owner",petId:pet.id,body:(i===0?"skin":i===1?"sleep":"routine")+" report",eventAt:new Date(Date.UTC(2024,i,3)).toISOString(),recordedAt:new Date(Date.UTC(2024,i,4)).toISOString()}));
const fetch=async(_r,p)=>{const rows=notes.filter(row=>(!p.terms.length||p.terms.some(t=>row.body.includes(t)))&&!(p.excludeTerms??[]).some(t=>row.body.includes(t)));return {sources:rows.slice(p.offset,p.offset+p.limit),total:rows.length,hasMore:p.offset+p.limit<rows.length};};
test("different lexical goals share twelve records before charging IO",async()=>{
 let physical=0;
 const [a,b]=await discoverHistoryBatch([req(["skin"]),req(["sleep"])],async(r,p)=>{physical++;if(p.terms.length)assert.deepEqual(p.terms,["skin","sleep"]);return fetch(r,p);});
 assert.equal(physical,2);assert.equal(a.batchAcquisition.rawRows,12);assert.equal(a.batchAcquisition.distinctCandidates,12);
 assert.equal(a.sources[0].body,"skin report");assert.equal(b.sources[0].body,"sleep report");assert.equal(a.sources.length,12);assert.equal(b.sources.length,12);assert.equal(b.sharedAcquisition,true);
 assert.equal(b.discovery[0].attempts,0);assert.equal(b.discovery[0].rawRows,0);assert.equal(b.sharedCollection,true);
 assert.equal(a.matchedTotal,null);assert.equal(a.scopeExhausted,true);
});
test("opposite incomplete endpoints and independent recorded bounds do not share a prefix",async()=>{
 const results=await discoverHistoryBatch([req(["skin"]),{...req(["sleep"]),order:"desc"},{...req(["skin"]),recordedFrom:"2024-06-01"}],async(r,p)=>({...await fetch(r,p),total:100,hasMore:true}),{pages:3,rows:12});
 assert.equal(results[0].batchAcquisition.attempts,3);assert.equal(results[0].batchAcquisition.coalescedGoals,0);assert.ok(results.every(r=>!r.scopeExhausted));
});
test("complete-set goals skip literal probes without claiming semantic completeness",async()=>{
 const [r]=await discoverHistoryBatch([{...req(["unlikely"]),goal:"complete_set"}],async(r,p)=>{assert.deepEqual(p.terms,[]);return fetch(r,p);});
 assert.equal(r.discovery.length,1);assert.equal(r.discovery[0].mode,"scoped");assert.equal(r.semanticRecallVerified,false);
});
test("main answer publishes selected verified timestamps",async()=>{
 const input={ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"Read dated evidence.",dialogue:[],now:"2024-12-31T00:00:00Z",timeZone:"UTC"};
 let catalog;
 const result=await runReadOnlyAsk(input,{read:async()=>({sources:notes.slice(0,1),total:1}),provider:async(packet,phase)=>{
  if(phase==="read_selection")return {calls:[{id:"a",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}],text:""};
  catalog=packet.SOURCE_CATALOG;assert.equal(packet.TOOL_DATA[0].sources[0].body,undefined);
  return {presentation:{sourceDates:["s1"],contextRequired:false},components:[{kind:"saved",text:"Here is the dated saved report.",sources:["s1"]}],sources:[],quotes:["s1"],calculations:[],replyType:"answer"};
 }});
 assert.equal(catalog[0].body,notes[0].body);
 const old=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="safe-regression-fixture-value-at-least-32-characters";
 try{const pub=buildReadOnlyPublication(result,"owner",pet.name).response;assert.ok(pub.directAnswer.includes("Event date: "+notes[0].eventAt));assert.ok(pub.directAnswer.includes("recorded date: "+notes[0].recordedAt));assert.ok(!pub.directAnswer.includes("can’t make changes"));}
 finally{if(old===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=old;}
});
test("independent two-line answer does not receive an irrelevant context appendix",async()=>{
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"A short exchange.",dialogue:[{role:"user",text:"x".repeat(3000)}],now:"2024-12-31T00:00:00Z",timeZone:"UTC"},{read:async()=>{throw Error("no read");},provider:async(_p,phase)=>phase==="read_selection"?{calls:[],text:""}:{presentation:{sourceDates:[],contextRequired:false},components:[{kind:"general",text:"One greeting.\nOne reply.",sources:[]}],sources:[],quotes:[],calculations:[],replyType:"answer"}});
 const pub=buildReadOnlyPublication(result,"owner",pet.name).response;assert.equal(pub.directAnswer.split("\n").length,2);assert.equal(pub.sections.length,0);
});

test("deterministic calculation is part of the main narrative with verified operands",async()=>{
 const sources=[0,1].map((i)=>({...notes[i],body:"Juniper weighed "+(3+i)+" kg."}));
 const input={ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"Compare the two dated weights.",dialogue:[],now:"2024-12-31T00:00:00Z",timeZone:"UTC"};
 const result=await runReadOnlyAsk(input,{read:async()=>({sources,total:2}),provider:async(_p,phase)=>phase==="read_selection"?{calls:[{id:"a",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}],text:""}:{presentation:{sourceDates:[],contextRequired:false},components:[{kind:"saved",text:"The historical body weight increased.",sources:["s1","s2"]}],sources:[],quotes:[],calculations:[{operation:"difference",timeBasis:"event",operands:["s1:m1","s2:m1"]}],replyType:"answer"}});
 const old=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="safe-regression-fixture-value-at-least-32-characters";
 try{const {response}=buildReadOnlyPublication(result,"owner",pet.name);assert.ok(response.directAnswer.includes("Change from earlier to later: 1 kg"));assert.ok(response.directAnswer.includes(sources[0].eventAt.slice(0,10)));assert.ok(response.directAnswer.includes(sources[1].eventAt.slice(0,10)));}
 finally{if(old===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=old;}
});
test("permuted shared collections retain source fairness and goal order",async()=>{
 const {allocateEvidence}=await import("../app/lib/ask-read-only/retrieval.mjs");
 const a=Array.from({length:24},(_,i)=>({...notes[0],id:"a-"+i})),b=Array.from({length:24},(_,i)=>({...notes[0],id:"b-"+i,petId:"another"}));
 const out=allocateEvidence([a,[...a].reverse(),b],{records:32,sourceCharacters:24000});
 assert.deepEqual(out.visible.map(g=>g.length),[16,16,16]);assert.deepEqual(out.visible[1].map(r=>r.id),out.visible[0].map(r=>r.id).reverse());
});

test("active provider adapter serializes the unique source catalog on the answer wire",async()=>{
 const {readOnlyProvider}=await import("../app/lib/ask-read-only/provider.ts");
 const wires=[],client={responses:{create:async request=>{wires.push(request);return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({answer:"A checked response."})}]}]};}}};
 await readOnlyProvider("offline",()=>{},client)({instructions:"Review owned evidence.",context:{question:"Compare reports."},draft:"",TOOL_DATA:[{sources:[{source:"s1"}]},{sources:[{source:"s1"}]}],SOURCE_CATALOG:[{source:"s1",body:"One owned original body."}],schema:{}},"read_answer");
 const serialized=JSON.parse(wires[0].input[0].content);
 assert.equal(serialized.SOURCE_CATALOG.length,1);assert.equal(serialized.SOURCE_CATALOG[0].body,"One owned original body.");
 assert.equal(wires[0].input[0].content.split("One owned original body.").length-1,1);
});
