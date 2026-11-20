import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAskConversationResponse,formatAskResponsePlainText} from '../app/lib/ask.mjs';
const base={title:'Furvise',summary:'The available notes describe a change.',sections:[],safetyNote:null,actions:['copy'],answerType:'history_summary'};
test('settled partial answers retain a visible and copied notice after persistence reload',()=>{
 const stored=JSON.parse(JSON.stringify({...base,turn:{finalStage:'COMPLETED',answerOutcome:'limited',creditState:'released'}}));
 const parsed=parseAskConversationResponse(stored);
 assert.equal(parsed.completionNotice,'I could not reliably complete every part of this answer.');
 assert.equal(parsed.summary,base.summary);assert.equal(parsed.directAnswer,base.summary);
 assert.ok(formatAskResponsePlainText(parsed).includes(parsed.completionNotice));
});
test('model-style labels and unsettled outcomes cannot create a completion notice',()=>{
 for(const turn of [undefined,{finalStage:'PERSISTED',answerOutcome:'limited'},{finalStage:'COMPLETED',answerOutcome:'complete'},{finalStage:'COMPLETED',answerOutcome:'not_assessed'}]){
  assert.equal(parseAskConversationResponse({...base,turn,completionNotice:'Claimed notice'}).completionNotice,undefined);
 }
});
test('completion status does not rewrite exact source text, JSON, or urgent guidance',()=>{
 for(const summary of ['"Owner note, exactly as stored."','{"records":[]}','Contact an emergency veterinarian now.']){
  const parsed=parseAskConversationResponse({...base,summary,turn:{finalStage:'COMPLETED',answerOutcome:'limited'}});
  assert.equal(parsed.summary,summary);assert.equal(parsed.completionNotice,'I could not reliably complete every part of this answer.');
 }
});

test('a limited answer that already names the missing evidence does not get a second warning',()=>{
 const summary="I don't see a food note from last month, so I can't confirm a switch.";
 const parsed=parseAskConversationResponse({...base,summary,turn:{finalStage:'COMPLETED',answerOutcome:'limited'}});
 assert.equal(parsed.completionNotice,undefined);
 assert.equal(parsed.summary,summary);
});

test("a limited clinical answer without saved-record evidence cannot assert history was searched",()=> {
 const parsed=parseAskConversationResponse({...base,summary:"If the sign returns, seek emergency veterinary care.",sections:[],turn:{finalStage:"COMPLETED",answerOutcome:"limited",creditState:"released"}});
 assert.equal(parsed.completionNotice,"I could not reliably complete every part of this answer.");
 assert.doesNotMatch(parsed.completionNotice,/saved history|records found|notes found/i);
});

test("a clarification does not show an unrelated completion failure",()=>{
 const parsed=parseAskConversationResponse({...base,answerType:"clarification",summary:"Which pet do you mean?",turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
 assert.equal(parsed.completionNotice,undefined);
 assert.equal(parsed.summary,"Which pet do you mean?");
});
