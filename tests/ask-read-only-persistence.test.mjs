import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isDeepStrictEqual} from "node:util";
import ts from "typescript";
import {isAiCreditIntegrityError} from "../app/lib/ai/usage-ledger.ts";
import {AskTurnLifecycle} from "../app/lib/ai/ask-turn-model.ts";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
import {finalizeDurableAskAnswer} from "../app/lib/furvise-brain/durable-answer-finalization.ts";
import {createAskAdmissionSettlement} from "../app/lib/ai/ask-admission-settlement.ts";
import {buildSuccessfulAskResponse} from "../app/lib/intelligence/finalize-ask-publication.ts";
const source=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
const ast=ts.createSourceFile("route.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const selected=["persistReadOnlyAnswer","finalizePersistedAskAnswer","validAssistantCompletionRow","completedResponseFromPersisted"];
const declarations=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&selected.includes(node.name?.text)||ts.isClassDeclaration(node)&&node.name?.text==="AskApiError").map(node=>node.getText(ast)).join("\n");
let publication;
function visit(node){if(ts.isTryStatement(node)&&node.tryBlock.getText(ast).includes("const {response,contextUsed,limited}=buildReadOnlyPublication"))publication=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(publication,"actual public publication/persistence catch boundary");
const dependencies=["Response","isDeepStrictEqual","finalizeDurableAskAnswer","buildSuccessfulAskResponse","buildReadOnlyPublication","completeAskConversationTurn","finalizeAskAssistantResponse","loadPersistedRequestByConversation","safeReleaseAiCredit","setAiCreditDisposition","completeAiCredit","getRemainingAiCredits","isAiCreditIntegrityError","logAskServerError","emitAskTurnTrace","FURVISE_ASK_UNAVAILABLE_MESSAGE","failAiAdmission","finalizeAiAdmissionAfterPersistence","readResult","userId","petId","profiles","requestId","providerCallCount","supabase","preparedRequest","turnLifecycle","usage","creditReserved","creditRequestId","aiCreditPayloadHash","aiAdmission","aiAdmissionFinalized","rateGateRef","handleAskApiError","console"];
const compiled=ts.transpileModule("export function make(scope){const {"+dependencies.join(",")+"}=scope;"+declarations+";return async()=>{"+publication+"};}",{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",pet="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",conversation="33333333-3333-4333-8333-333333333333",userMessage="44444444-4444-4444-8444-444444444444";
const id="11111111-1111-4111-8111-111111111111",message="22222222-2222-4222-8222-222222222222";
async function fixture(options={}){
 const events=[],state={row:null,credits:0,released:false,terminalWrites:0,logs:[]};
 let calls=0;
 const readResult=await runReadOnlyAsk({ownerId:owner,selectedPetId:pet,pets:[{id:pet,ownerId:owner,name:"Juniper",species:"cat"}],question:"Explain this generally.",dialogue:[],now:"2026-11-08T12:00:00Z",timeZone:"UTC"},{
  read:async()=>{throw Error("general reply cannot retrieve");},provider:async()=>++calls===1?{calls:[],text:"An explanation."}:{answer:options.limited?"Which date did you mean?":"Here is the explanation.",quotes:[],sources:[],calculations:[],replyType:options.limited?"clarification":"answer"}
 });
 const turn=new AskTurnLifecycle(id,id).transition("GENERATING").credit("reserved").outcomes(options.limited?"limited":"complete","not_requested");
 turn.providerCall();turn.providerCall();
 const logger=(...args)=>state.logs.push(args[0]),admission={complete:async()=>events.push("admission:complete"),fail:async()=>events.push("admission:fail")};
 const settlement=createAskAdmissionSettlement(logger);
 const scope={Response,isDeepStrictEqual,finalizeDurableAskAnswer,buildSuccessfulAskResponse,buildReadOnlyPublication,
  completeAskConversationTurn:async input=>{assert.equal(input.userId,owner);events.push("assistant:initial");state.row={id:message,request_id:id,context_used:input.contextUsed,save_metadata:input.saveMetadata,response_data:structuredClone(input.responseData)};return {data:[{assistant_message_id:message}],error:null};},
  finalizeAskAssistantResponse:async input=>{
   assert.equal(input.userId,owner);assert.equal(input.messageId,message);state.terminalWrites++;events.push("assistant:terminal");
   if(!options.failTerminal)state.row.response_data=structuredClone(input.responseData);
   if(options.failTerminal||options.lostAcknowledgment)return {data:false,error:Error("simulated persistence acknowledgment failure")};
   return {data:true,error:null};
  },
  loadPersistedRequestByConversation:async input=>{
   assert.equal(input.userId,owner);events.push("assistant:readback");
   const row=structuredClone(state.row);if(options.changedReadback)row.response_data.summary="A different answer.";
   return {conversationId:conversation,userMessageId:userMessage,userSequence:1,assistantMessage:row,userMessage:{user_text:"Explain this generally."}};
  },
  safeReleaseAiCredit:async()=>{events.push("credit:release");if(options.failRelease)throw Error("simulated release outage");if(state.credits)throw Error("AI_CREDIT_TERMINAL_CONFLICT");state.released=true;return true;},
  setAiCreditDisposition:async input=>{assert.equal(input.userId,owner);assert.equal(input.logicalRequestId,id);events.push("credit:intent");if(options.failDisposition)throw Error("simulated disposition outage");},
  completeAiCredit:async()=>{events.push("credit:complete");if(options.failCredit)throw Error("simulated settlement outage");state.credits++;},
  getRemainingAiCredits:async()=>({limit:15,remaining:15-state.credits,planId:"free"}),isAiCreditIntegrityError,logAskServerError:logger,emitAskTurnTrace:()=>events.push("trace"),
  FURVISE_ASK_UNAVAILABLE_MESSAGE:"temporarily unavailable",...settlement,readResult,userId:owner,profiles:[{name:"Juniper"}],requestId:id,providerCallCount:calls,
  petId:pet,supabase:{},preparedRequest:{conversationId:conversation,userMessageId:userMessage,userSequence:1},turnLifecycle:turn,usage:{limit:15,remaining:15,planId:"free"},
  creditReserved:true,creditRequestId:id,aiCreditPayloadHash:"a".repeat(64),aiAdmission:admission,aiAdmissionFinalized:false,rateGateRef:{current:{release:async()=>events.push("lease:release")}},
  handleAskApiError:()=>Response.json({success:false},{status:503}),console:{info(){}}
 };
 return {events,state,run:make(scope),calls};
}
test("successful publication returns a persisted read-only answer",async()=>{
 const f=await fixture(),response=await f.run();assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.success,true);assert.equal(body.persistence.saved,true);
 assert.equal(f.state.credits,1);assert.equal(f.calls,2);assert.equal(f.events.at(-1),"lease:release");
});
test("read-only terminal answer is durable before a credit can complete",async()=>{
 const f=await fixture(),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:complete"),f.events.join(","));
 assert.equal(f.state.credits,1);assert.equal(f.calls,2);assert.equal(f.events.at(-1),"lease:release");
});
test("failed terminal finalization cannot charge merely because an initial row exists",async()=>{
 const f=await fixture({failTerminal:true}),response=await f.run();
 assert.equal(response.status,503);assert.equal(f.state.credits,0);assert.equal(f.state.released,true);
 assert.ok(!f.events.includes("credit:intent"));assert.equal(f.events.at(-1),"lease:release");
});
test("changed terminal readback fails closed without a completed credit",async()=>{
 const f=await fixture({lostAcknowledgment:true,changedReadback:true}),response=await f.run();
 assert.equal(response.status,503);assert.equal(f.state.credits,0);assert.equal(f.state.released,true);
});
test("committed terminal answer with a lost acknowledgment is recovered before one credit completion",async()=>{
 const f=await fixture({lostAcknowledgment:true}),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:readback")<f.events.indexOf("credit:complete"),f.events.join(","));
 assert.equal(f.state.credits,1);assert.equal((await response.json()).creditsUsed,1);
});
test("credit-disposition outage does not discard an already durable answer",async()=>{
 const f=await fixture({failDisposition:true}),response=await f.run();assert.equal(response.status,200);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.credits,0);assert.ok(!f.events.includes("credit:release"));
});
test("credit completion outage preserves the durable answer and pending settlement",async()=>{
 const f=await fixture({failCredit:true}),response=await f.run();assert.equal(response.status,200);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.credits,0);assert.ok(!f.events.includes("credit:release"));
});
test("a clarification is durably saved before its reservation is released",async()=>{
 const f=await fixture({limited:true}),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:release"),f.events.join(","));
 assert.equal(f.state.credits,0);assert.equal(f.state.released,true);assert.equal((await response.json()).creditsUsed,0);
});

test("release outage preserves a durable clarification without claiming a completed credit",async()=>{
 const f=await fixture({limited:true,failRelease:true}),response=await f.run();
 assert.equal(response.status,200);assert.equal(f.state.credits,0);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");
 const body=await response.json();assert.equal(body.creditsUsed,0);
 assert.equal(body.turn.creditState,"release_pending");
});
