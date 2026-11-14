import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication,MAX_READ_ONLY_PUBLICATION_BYTES} from "../app/lib/ask-read-only/publication.ts";
import {parseAskConversationResponse} from "../app/lib/ask.mjs";
import {verifyAskCitationProof} from "../app/lib/ask-citation-proof.ts";

async function resultFor(answer,replyType="answer",record=null){
 let calls=0;
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"cat"}],
 question:"Explain the requested information.",dialogue:[],now:"2026-11-09T00:00:00Z",timeZone:"UTC"},{
 read:async()=>({sources:[record],total:1}),
 provider:async()=>++calls===1?{calls:record?[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"})}]:[],text:answer}
 :{answer,quotes:record?["s1"]:[],sources:[],calculations:[],replyType}
 });
 assert.equal(calls,2);return result;
}
for(const [claim,remainder] of [
 ["I deleted the note.","Silly cat joke: It wanted a mouse."],
 ["I saved that update.","Here is a general explanation."],
 ["The profile has been updated in Furvise.","A separate science answer follows."],
 ["I will remove the record.","The arithmetic example is 2 + 2 = 4."],
 ["I opened your profile.","The Moon is rocky."],
 ["I have recorded that in your history.","Here is the unrelated answer."],
 ["I archived the pet.","The requested poem follows."],
 ["I deleted the note.",""]
])test("removed unsupported execution speech retains an explicit capability boundary: "+claim,async()=>{
 const result=await resultFor([claim,remainder].filter(Boolean).join(" "));
 const {response,limited}=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(limited,true);assert.equal(result.providerCallCount,2);
 assert.match(response.summary,/can.t make changes/i);
 assert.match(response.summary,/can.t.*open pages|can.t make changes or open pages/i);
 assert.ok(!response.summary.includes(claim));
 if(remainder)assert.ok(response.summary.includes(remainder));
 assert.deepEqual(response.applicationActions,[]);assert.deepEqual(response.actions,["copy"]);
 const replay=parseAskConversationResponse({...response,turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
 assert.equal(replay.summary,response.summary);assert.equal(replay.directAnswer,response.summary);
 assert.equal(replay.completionNotice,undefined,"a clear boundary must not turn into a generic verification-failure card");
});
for(const answer of [
 "I can’t delete saved notes through Ask. Here is a joke.",
 "I haven’t deleted anything. Here is a joke.",
 "The Moon is rocky.",
 'A fictional character in a story says "I deleted the note." This is literary dialogue.'
])test("publication preserves safe conversational meaning without a capability preamble: "+answer,async()=>{
 const {response}=buildReadOnlyPublication(await resultFor(answer),"owner","Juniper");
 assert.equal(response.summary,answer);
});
test("unsupported model execution claims cannot rewrite exact source wording or citation identity",async t=>{
 const previous=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;
 process.env.FURVISE_RATE_LIMIT_HASH_SECRET="offline-publication-boundary-fixture-secret-2026";
 t.after(()=>{if(previous===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=previous;});
 const record={kind:"history",id:"note",ownerId:"owner",petId:"pet",body:"I deleted the note. 🐾 cafe\u0301\nOriginal saved wording.",eventAt:"2025-06-01T00:00:00Z",recordedAt:"2025-06-02T00:00:00Z"};
 const result=await resultFor("I deleted the note. The original saved wording is quoted below.","answer",record);
 const {response,limited}=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(limited,true);assert.match(response.summary,/can.t make changes/i);
 assert.deepEqual(response.sections.find(s=>s.heading==="Saved notes").items,[record.body]);
 const replay=parseAskConversationResponse({...response,turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
 assert.deepEqual(replay.sections,response.sections);
 assert.equal(verifyAskCitationProof(response.citationProof,"owner",replay).sources.length,1);
});

test("publication size fallback retains the capability boundary without overflowing storage",async()=>{
 const result=await resultFor("I deleted the note. "+"字".repeat(11950));
 const {response,limited}=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(limited,true);assert.equal(result.providerCallCount,2);
 assert.match(response.summary,/can.t make changes/i);assert.match(response.summary,/reply size limit/i);
 assert.ok(Buffer.byteLength(JSON.stringify(response,null,1),"utf8")<=MAX_READ_ONLY_PUBLICATION_BYTES);
 const replay=parseAskConversationResponse({...response,turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
 assert.equal(replay.summary,response.summary);assert.equal(replay.completionNotice,undefined);
});

test("unsupported conditional image offer cannot survive final publication",async()=>{
 const answer="I can’t tell the unrecorded inscription. If you have a clear photo of the collar or tag, I can help read it.";
 const {response,limited}=buildReadOnlyPublication(await resultFor(answer),"owner","Juniper");
 assert.ok(response.summary.startsWith("I can’t tell the unrecorded inscription."));
 assert.doesNotMatch(response.summary,/I can help read it/);
 assert.match(response.summary,/text.only|can.t.*(?:photo|image)/i);
 assert.equal(limited,true);
});
