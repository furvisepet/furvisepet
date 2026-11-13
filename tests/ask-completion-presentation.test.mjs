import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAskConversationResponse,formatAskResponsePlainText} from '../app/lib/ask.mjs';
const base={title:'Furvise',summary:'The available notes describe a change.',sections:[],safetyNote:null,actions:['copy'],answerType:'history_summary'};
test('settled partial answers retain a visible and copied notice after persistence reload',()=>{
 const stored=JSON.parse(JSON.stringify({...base,turn:{finalStage:'COMPLETED',answerOutcome:'limited',creditState:'released'}}));
 const parsed=parseAskConversationResponse(stored);
 assert.equal(parsed.completionNotice,'I couldn\'t confirm every part of this answer.');
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
  assert.equal(parsed.summary,summary);assert.equal(parsed.completionNotice,'I couldn\'t confirm every part of this answer.');
 }
});

test('a limited answer that already names the missing evidence does not get a second warning',()=>{
 const summary="I don't see a food note from last month, so I can't confirm a switch.";
 const parsed=parseAskConversationResponse({...base,summary,turn:{finalStage:'COMPLETED',answerOutcome:'limited'}});
 assert.equal(parsed.completionNotice,undefined);
 assert.equal(parsed.summary,summary);
});

test('a persisted source-only limit uses its specific coverage without a generic failure card',()=>{
 const stored={...base,readOnlyEvidence:true,
  sections:[{heading:'Search coverage',items:['Only a bounded subset of the earlier result was retained.']}],
  readOnlyTaskCompletion:[{id:'t1',status:'partial',reason:'source_omitted',sourceCount:8},{id:'t2',status:'complete',reason:'none',sourceCount:4}],
  turn:{finalStage:'COMPLETED',answerOutcome:'limited'}};
 assert.equal(parseAskConversationResponse(JSON.parse(JSON.stringify(stored))).completionNotice,undefined);
 for(const change of [
  {readOnlyTaskCompletion:[...stored.readOnlyTaskCompletion,{id:'t3',status:'unresolved',reason:'not_answered',sourceCount:0}]},
  {readOnlyTaskCompletion:[{id:'t1',status:'partial',reason:'source_omitted',sourceCount:0}]},
  {sections:[]},{readOnlyEvidence:false}
 ])assert.ok(parseAskConversationResponse({...stored,...change}).completionNotice);
});
