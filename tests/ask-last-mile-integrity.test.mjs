import test from 'node:test';
import assert from 'node:assert/strict';
import {answerIntegrityFailure} from '../app/lib/answer-integrity.ts';
import {enforceVerifiedStateClaims} from '../app/lib/application-actions/state-claims.ts';
import {buildAskConversationResponse} from '../app/lib/ask.mjs';
import { unwrapProseEnvelope } from "../app/lib/furvise-output.ts";
import {recoverTransientClaim} from '../app/lib/security/idempotency/claim-recovery.ts';
const answer = summary => ({title:'Furvise',summary,sections:[],safetyNote:null});
test('retrieved relative-clause measurements survive all ordinary answer transforms',()=>{
 for(const value of ['The earliest weight I have saved for Rowan is 7.21 kg on 2020-03-04.',
   'The latest measurement I recorded for Birch was 12.8 kg on 2025-04-09.']){
  const before=answer(value),after=buildAskConversationResponse(answer(enforceVerifiedStateClaims(value,false)));
  assert.equal(after.directAnswer,value);assert.equal(answerIntegrityFailure(before,after),null);
 }
 const unsafe='The earliest weight I have saved for Rowan is 7.21 kg. I updated her profile.';
 assert.doesNotMatch(enforceVerifiedStateClaims(unsafe,false),/I updated/);
 assert.equal(enforceVerifiedStateClaims('I have saved her weight.',false),'I can help with that.');
});
test('last-mile rejection catches numeric and uncertainty deletion, not layout',()=>{
 const a=answer('Weight 7.21 kg. Cause unknown.');
 assert.equal(answerIntegrityFailure(a,answer('I can help with that.')),'empty_answer');
 assert.equal(answerIntegrityFailure(a,{...answer('I can help with that.'),safetyNote:'Consult your vet.'}),'empty_answer');
 assert.equal(answerIntegrityFailure(a,answer('Cause unknown.')),'lost_numeric_fact');
 assert.equal(answerIntegrityFailure(a,answer('Weight 7.21 kg.')),'lost_uncertainty');
 assert.equal(answerIntegrityFailure(a,answer('- Weight 7.21 kg.\n- Cause unknown.')),null);
 assert.equal(answerIntegrityFailure(answer('The owner reported itching. Cause unknown.'),answer('Cause unknown.')),'changed_answer_content');
 assert.equal(answerIntegrityFailure(answer('Rowan weighed 7 kg and Birch weighed 8 kg.'),answer('Birch weighed 7 kg and Rowan weighed 8 kg.')),'changed_answer_content');
});
test('prose envelope decoding preserves limitations and rejects unknown metadata',()=>{
 assert.equal(unwrapProseEnvelope('{"answer":"Food A was offered.","note":"Other meals are unknown."}'),'Food A was offered.\nOther meals are unknown.');
 for(const raw of ['{"answer":"A","hidden":"B"}','{"answer":"A","note":4}','{"dose":7}'])assert.equal(unwrapProseEnvelope(raw),raw);
});
test('transient admission recovery retains lease semantics and stops after two calls',async()=>{
 let calls=0;const result=await recoverTransientClaim(async()=>{if(++calls===1)throw {status:503};return {claim_outcome:'in_progress'};});
 assert.equal(result.claim_outcome,'in_progress');assert.equal(calls,2);
 calls=0;await assert.rejects(recoverTransientClaim(async()=>{calls++;throw {status:503};}));assert.equal(calls,2);
 for(const error of [{status:401},{status:403},{code:'42501'},{code:'23505'},{code:'PGRST301'}]){
  calls=0;await assert.rejects(recoverTransientClaim(async()=>{calls++;throw error;}));assert.equal(calls,1);
 }
});
