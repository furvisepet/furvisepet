import test from "node:test";
import assert from "node:assert/strict";
import {buildAskConversationResponse,parseAskConversationResponse} from "../app/lib/ask.mjs";

const draft=()=>({
 ...buildAskConversationResponse({title:"Furvise",summary:"The latest note says appetite was stable.",sections:[],safetyNote:null}),
 turn:{finalStage:"COMPLETED",answerOutcome:"limited"}
});
test("a completed sourced answer does not show a false generic incomplete banner",()=>{
 const answer={...draft(),readOnlyTaskCompletion:[{id:"t1",kind:"saved_content",status:"complete",reason:"none",sourceCount:1}]};
 const parsed=parseAskConversationResponse(answer);
 assert.equal(parsed.completionNotice,undefined);
});
test("an actually incomplete requested part keeps its completion notice",()=>{
 const answer={...draft(),readOnlyTaskCompletion:[{id:"t1",kind:"saved_content",status:"partial",reason:"source_omitted",sourceCount:1}]};
 const parsed=parseAskConversationResponse(answer);
 assert.match(parsed.completionNotice,/could not reliably complete/);
});
test("a specific partial-history caveat is not followed by a generic banner",()=>{
 const answer={...draft(),summary:"The returned notes show routine play. The history search was partial.",
  directAnswer:"The returned notes show routine play. The history search was partial.",
  readOnlyTaskCompletion:[{id:"t1",kind:"saved_content",status:"partial",reason:"source_omitted",sourceCount:2}]};
 const parsed=parseAskConversationResponse(answer);
 assert.equal(parsed.completionNotice,undefined);
});
