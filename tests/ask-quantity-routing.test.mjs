import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAskReadProposal } from '../app/lib/intelligence/ask-plan-recovery.ts';
import { emptyProposedSemanticFrame } from '../app/lib/intelligence/semantic-frame/extract-frame.ts';
const pet={id:'pet-a',name:'Pip',user_id:'owner'};
const context=currentMessage=>({owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage,conversationTurns:[]});
const proposal=()=>({operation:'count',readOperation:'count',subject:'explicit',petNames:['Pip'],
  topic:'soft stool',terms:['stool'],from:'2026-04-03',to:'2026-04-10',
  episodeTopic:'soft stool',ordinal:null,selection:'period',frame:emptyProposedSemanticFrame()});
for(const message of [
  "How many days are there from Pip's April 3 soft-stool note to April 9?",
  "How many weeks passed between Pip's vomiting note and his recovery?",
  "How many hours elapsed between Pip's two breathing episodes?",
  "How many months was Pip on medication?",
]) test('time quantity is not an illness-episode count: '+message,()=>{
  const input=proposal(),p=normalizeAskReadProposal(input,context(message));
  assert.equal(p.operation,'recall');assert.equal(p.readOperation,'recall');
  assert.equal(p.episodeTopic,null);assert.deepEqual(p.petNames,input.petNames);
  assert.equal(p.from,input.from);assert.equal(p.to,input.to);
});
for(const message of [
  'How many soft-stool episodes did Pip have in those days?',
  'How many times did Pip vomit?',
  'How many separate breathing episodes did Pip have?',
]) test('episode quantities retain episode semantics: '+message,()=>{
  assert.equal(normalizeAskReadProposal(proposal(),context(message)).operation,'count');
});

test('mixed duration and episode count is not silently reduced to duration',()=>{
  const p=normalizeAskReadProposal(proposal(),context('How many days passed and how many episodes did Pip have?'));
  assert.equal(p.operation,'count');
});
test('duration normalization never discards an explicit episode reference',()=>{
  const p=normalizeAskReadProposal({...proposal(),ordinal:'second'},
    context("How many days passed between Pip's second episode and recovery?"));
  assert.equal(p.ordinal,'second');assert.equal(p.operation,'count');
});
