import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoverAskInterpretation, interpretAskQuestion } from "../app/lib/intelligence/interpret-ask.ts";
import { validateAskRequest } from "../app/lib/intelligence/ask-request-contract.ts";
import { runWithAiAdmission } from "../app/lib/ai/usage-guard/context.ts";
import { OperationDeadline, StageDeadlineError } from "../app/lib/ai/execution-deadline.ts";
import { createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";

const cedar={id:"cedar",user_id:"owner",name:"Cedar",species:"dog"};
const moss={...cedar,id:"moss",name:"Moss"};
const context=(text="What was his last recorded weight?")=>({
 owner:{userId:"owner"},pet:cedar,eligiblePets:[cedar,moss],currentMessage:text,
 currentTurn:{id:"current",role:"user",text},conversationTurns:[],timeZone:"UTC",
 planningSourceWindow:{retainedPriorUserTurnIds:[],pinnedSourceIds:[],omittedPriorUserTurns:1,disclosure:"One earlier user turn mentioning Moss was omitted."}
});
const proposal=ctx=>({version:"ask-request.v2",mode:"read",question:ctx.currentMessage,
 requirements:[],referenceTurnIds:[],evidenceNeeds:[],evidenceBasis:"saved_history",scope:"account",petNames:[],
 operation:"recall",selection:"summary",quantity:"records",topic:"weight",terms:[],from:null,to:null,
 episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[],
 readTicket:{authority:"effective_fact",subjectScope:"selected",operation:"read",
 temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:"text_any",terms:["weight","weighed"]}],
 outputs:{strategy:null,completeness:"sufficient",ordering:"desc",limit:1},searchHints:null,episode:null,selection:null,probes:[]}
});

test("post-normalization Binder rejects outer account / selected ticket after omitted Moss",()=>{
 const ctx=context(),p=proposal(ctx);
 // A valid ticket reaches selected Cedar in the complete-history control.
 const full=validateAskRequest(p,{...ctx,planningSourceWindow:undefined});
 assert.deepEqual(full.petIds,["cedar"]);assert.ok(full.request.readTicket);
 assert.throws(()=>validateAskRequest(p,ctx),/ASK_REQUEST_INVALID:omitted_subject_reference/);
 assert.throws(()=>recoverAskInterpretation(p,ctx),/OMITTED_SUBJECT_REFERENCE/);
 assert.equal(p.scope,"account");assert.equal(p.readTicket.subjectScope,"selected");
});
test("post-normalization guard preserves explicit current Cedar and account-wide reads",()=>{
 const ctx=context("What was Cedar's last recorded weight?");
 assert.deepEqual(recoverAskInterpretation(proposal(ctx),ctx).petIds,["cedar"]);
 const all=context("Show weight records for all my pets."),p=proposal(all);p.readTicket.subjectScope="account";
 assert.deepEqual(recoverAskInterpretation(p,all).petIds,["cedar","moss"]);
});
test("legacy account-to-selected normalization cannot bypass omission guard",()=>{
 const ctx=context("What is his saved name?");
 const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8"));
 const p={...structuredClone(corpus.fixtures.find(f=>f.canonical.request.evidenceBasis==="saved_profile").canonical.request),
 question:ctx.currentMessage,scope:"account",petNames:[]};
 assert.throws(()=>validateAskRequest(p,ctx),/ASK_REQUEST_INVALID:omitted_subject_reference/);
});

test("operation expiry during compilation stops before admission or SDK",async()=>{
 let clock=0,checks=0,calls=0,admissions=0;
 const deadline=new OperationDeadline(25_000,()=>clock),allocate=deadline.allocate.bind(deadline);
 deadline.allocate=(...args)=>{if(++checks===12)clock=1_001;return allocate(...args);};
 const admission={deadline,beginProviderCall:async()=>{admissions++;throw Error("UNEXPECTED_ADMISSION");}};
 const ctx=context("What name is saved for Cedar?");delete ctx.planningSourceWindow;
 await assert.rejects(runWithAiAdmission(admission,()=>interpretAskQuestion({context:ctx,model:"gpt-5.4-mini",
 client:{responses:{create:async()=>{calls++;throw Error("UNEXPECTED_SDK");}}}})),StageDeadlineError);
 assert.equal(checks,12);assert.equal(calls,0);assert.equal(admissions,0);
});
test("compiler checkpoints interrupt inner work and do not become decoder state",()=>{
 const schema={type:"object",additionalProperties:false,required:["value"],properties:{value:{type:"string"}}};
 const expired=new StageDeadlineError("interpretation",0);
 let checks=0;
 assert.throws(()=>createGraphCodec(schema,()=>{if(++checks===25)throw expired;}),e=>e===expired);
 let live=true;
 const codec=createGraphCodec(schema,()=>{if(!live)throw expired;});
 live=false;
 assert.deepEqual(codec.decode(codec.encode({value:"exact 🐾 cafe\u0301"})),{value:"exact 🐾 cafe\u0301"});
 assert.throws(()=>codec.decode({nodes:[]}),/ASK_WIRE_/);
});
