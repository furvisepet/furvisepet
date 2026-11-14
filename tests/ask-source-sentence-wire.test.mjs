import test from "node:test";
import assert from "node:assert/strict";
import {prepareSourceSentenceWire,decodeSourceSentenceWire} from "../app/lib/ask-read-only/source-sentence-wire.mjs";
import {buildReadOnlyProviderRequest} from "../app/lib/ask-read-only/provider-request.mjs";
import {historySynthesisSchema,validateHistorySynthesis} from "../app/lib/ask-read-only/history-synthesis.mjs";
const exact={type:"object",additionalProperties:false,properties:{source:{type:"string",enum:["s1"]},excerpt:{type:"string",maxLength:280}},required:["source","excerpt"]};
const body="Miso weighed 5.11 kg. A few coat mats formed behind the front legs and were removed during grooming. Skin underneath looked normal.";
const input=()=>({instructions:"Original rules",context:{question:"Summarize the history."},SOURCE_CATALOG:[{source:"s1",kind:"history",body,eventAt:"2021-02-15T12:00:00Z",recordedAt:"2021-02-16T12:00:00Z",pet:"Miso"}],schema:{type:"object",properties:{completion:{type:"array",items:{type:"object",properties:{historyFacts:{type:"array",items:exact},historySynthesis:historySynthesisSchema(["s1"])}}},clinicalReview:{const:"unchanged"},ownerFacts:{const:"unchanged"},quotes:{const:"unchanged"}},required:["completion","clinicalReview","ownerFacts","quotes"]}});
const answer=e=>({clinicalReview:{scenario:"historical"},quotes:["s1"],completion:[{historyFacts:[e],historySynthesis:[{topic:"coat mats",evidence:[e]}]}]});
const selector={source:"s1",firstSentence:2,lastSentence:3};
test("wire replaces only historical excerpts and carries every original byte once",()=>{
 const i=input(),before=structuredClone(i),wire=prepareSourceSentenceWire(i);
 assert.deepEqual(i,before);assert.deepEqual(wire.catalog[0].sentences.join(""),body);assert.equal(wire.catalog[0].body,undefined);
 assert.deepEqual(wire.schema.properties.clinicalReview,i.schema.properties.clinicalReview);
 assert.deepEqual(wire.schema.properties.ownerFacts,i.schema.properties.ownerFacts);
 assert.deepEqual(wire.schema.properties.quotes,i.schema.properties.quotes);
 assert.equal(wire.schema.properties.completion.items.properties.historyFacts.items.properties.excerpt,undefined);
 assert.deepEqual(wire.schema.properties.completion.items.properties.historyFacts.items.required,["source","firstSentence","lastSentence"]);
});
test("exact source sentences restore quote, source, pet, timestamps and single-event scope",()=>{
 const i=input(),raw=answer(selector),before=structuredClone(raw),v=decodeSourceSentenceWire(raw,i),excerpt=body.slice(body.indexOf("A few"));
 assert.deepEqual(raw,before);assert.deepEqual(v.completion[0].historyFacts,[{source:"s1",excerpt}]);assert.deepEqual(v.clinicalReview,raw.clinicalReview);assert.deepEqual(v.quotes,raw.quotes);
 const themes=validateHistorySynthesis(v.completion[0].historySynthesis,[{handle:"s1",kind:"history",body,petId:"owned",petName:"Miso",eventAt:i.SOURCE_CATALOG[0].eventAt,recordedAt:i.SOURCE_CATALOG[0].recordedAt}],["s1"]);
 assert.equal(themes[0].evidence[0].excerpt,excerpt);assert.equal(themes[0].evidence[0].eventAt,i.SOURCE_CATALOG[0].eventAt);
});
test("Unicode, negative and hypothetical statements remain complete and verbatim",()=>{
 const i=input();i.SOURCE_CATALOG[0].body="Ã‰cho did not collapse. If she collapses later, call the vet. She is normal today.";
 const v=decodeSourceSentenceWire(answer({source:"s1",firstSentence:1,lastSentence:3}),i);
 assert.equal(v.completion[0].historyFacts[0].excerpt,i.SOURCE_CATALOG[0].body);
});
test("forged, foreign, duplicate, profile, stale and malformed selectors fail closed",()=>{
 for(const e of [{...selector,source:"foreign"},{...selector,firstSentence:0},{...selector,firstSentence:2.5},{...selector,lastSentence:4096},{...selector,lastSentence:1},{...selector,excerpt:"fabricated"},{source:"s1",excerpt:"Old format must not bypass selectors"}]){
  assert.throws(()=>decodeSourceSentenceWire(answer(e),input()),{code:"ASK_READ_COMPONENT_CONTRACT"});
 }
 for(const mode of ["duplicate","profile","deleted","changed"]){
  const i=input();if(mode==="duplicate")i.SOURCE_CATALOG.push({...i.SOURCE_CATALOG[0]});if(mode==="profile")i.SOURCE_CATALOG[0].kind="profile";if(mode==="deleted")i.SOURCE_CATALOG=[];if(mode==="changed")i.SOURCE_CATALOG[0].body="Changed.";
  assert.throws(()=>decodeSourceSentenceWire(answer(selector),i));
 }
});
test("overlong source spans are rejected rather than shortened or salvaged",()=>{
 const i=input();i.SOURCE_CATALOG[0].body="An original sentence "+ "x".repeat(281)+".";
 assert.throws(()=>decodeSourceSentenceWire(answer({source:"s1",firstSentence:1,lastSentence:1}),i));
});
test("32 admitted bodies remain intact; compact evidence is smaller without changing token cap",()=>{
 const i=input();i.SOURCE_CATALOG=Array.from({length:32},(_,n)=>({...i.SOURCE_CATALOG[0],source:"s"+(n+1)}));
 const wire=buildReadOnlyProviderRequest("model",i,"read_answer",2400,{maxInputCharacters:100000,maxInputTokens:40000});
 const data=JSON.parse(wire.input[0].content);assert.equal(data.SOURCE_CATALOG.length,32);assert.ok(data.SOURCE_CATALOG.every(s=>s.sentences.join("")===body));
 assert.equal(wire.max_output_tokens,2400);assert.match(wire.instructions,/firstSentence/);
 const canonical=decodeSourceSentenceWire(answer(selector),i);
 assert.ok(JSON.stringify(answer(selector)).length<JSON.stringify(canonical).length*.75);
});
test("selection and non-component adapters retain their original protocol",()=>{
 const i={schema:{type:"object"},SOURCE_CATALOG:[{source:"s1",body:"Intact."}]};assert.deepEqual(prepareSourceSentenceWire(i),{schema:i.schema,catalog:i.SOURCE_CATALOG,instructions:""});
 const v={answer:"general"};assert.equal(decodeSourceSentenceWire(v,i),v);
});

test("native provider decodes selectors before downstream validation and rejects incomplete envelopes",async()=>{
 const {readOnlyProvider}=await import("../app/lib/ask-read-only/provider.ts");
 for(const status of ["completed","incomplete"]){
  let calls=0;const i=input(),raw=answer(selector),events=[];
  const client={responses:{create:async wire=>{
   calls++;assert.equal(wire.max_output_tokens,2400);
   assert.ok(!JSON.stringify(wire.text.format.schema).includes('"excerpt"'));
   return {status,incomplete_details:status==="incomplete"?{reason:"max_output_tokens"}:undefined,output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(raw)}]}],usage:{input_tokens:100,output_tokens:100}};
  }}};
  const invoke=readOnlyProvider("offline",e=>events.push(e),client);
  if(status==="completed"){const v=await invoke(i,"read_answer");assert.equal(v.completion[0].historyFacts[0].excerpt,body.slice(body.indexOf("A few")));}
  else{await assert.rejects(invoke(i,"read_answer"));assert.ok(!events.some(e=>e.outcome==="succeeded"));}
  assert.equal(calls,1);
 }
});
