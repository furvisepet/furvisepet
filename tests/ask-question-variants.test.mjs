import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOwnerAssertions } from '../app/lib/ai/owner-assertion.ts';
import { classifyUserTurn } from '../app/lib/ai/turn-classifier.ts';
import { normalizeAskReadProposal, datedNoteReformulation } from '../app/lib/intelligence/ask-plan-recovery.ts';
import { historyNarrativeAnchorsSupported } from '../app/lib/intelligence/history-narrative-facts.ts';
import { emptyProposedSemanticFrame } from '../app/lib/intelligence/semantic-frame/extract-frame.ts';
const pet={id:'a',name:'Pip',user_id:'owner'};
const context=(currentMessage,prior=[])=>({owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage,conversationTurns:prior.map(text=>({role:'user',text}))});
const proposal=(operation='count')=>({operation,readOperation:operation,subject:'explicit',petNames:['Pip'],topic:'history',terms:['accident'],from:null,to:null,ordinal:null,episodeTopic:null,selection:'summary',frame:emptyProposedSemanticFrame()});
test('whose historical question and source-reference clause cannot authorize observations',()=>{
 for(const q of ["Whose dog was the vomiting correction about, and did it say Pip vomited?","Does the April 3 note describe one accident or two? It is Pip's note."])
  assert.equal(analyzeOwnerAssertions(q).hasOwnerAssertion,false,q);
 assert.equal(analyzeOwnerAssertions("Whose dog was the correction about? Pip vomited today.").hasOwnerAssertion,true);
 assert.equal(analyzeOwnerAssertions("It is Pip's note. He is vomiting.").hasOwnerAssertion,true);
 assert.equal(analyzeOwnerAssertions("It is Pip's note, and he is vomiting today.").hasOwnerAssertion,true);
});
test('complete thanks variation avoids subject clarification without swallowing an observation',()=>{
 assert.equal(classifyUserTurn('Thanks a lot, that clears it up.').isLowValueAcknowledgement,true);
 assert.equal(classifyUserTurn('Thanks a lot, Pip vomited today.').isLowValueAcknowledgement,false);
});
test('bounded note-choice quantity remains recall and supports only the stated two events',()=>{
 const q="Does the April 3 note describe one accident or two? It is Pip's note.";
 const p=normalizeAskReadProposal(proposal(),context(q));
 assert.equal(p.operation,'recall');assert.equal(p.from,new Date().getUTCFullYear()+'-04-03');assert.deepEqual(p.terms,[]);
 const sources=[{text:'Pip urinated on the mat once yesterday and once today.',occurredAt:'2026-04-03',petId:'a'}];
 assert.equal(historyNarrativeAnchorsSupported('The April 3 note describes two accidents.',sources,q),true);
 assert.equal(historyNarrativeAnchorsSupported('The April 3 note describes three accidents.',sources,q),false);
 assert.equal(historyNarrativeAnchorsSupported('Two episodes.',sources,q),false);
});
test('separate phrasing derives only two explicit calendar endpoints',()=>{
 const q="How many days separate Pip's April 3 and April 9 notes?";
 const p=normalizeAskReadProposal(proposal(),context(q));
 assert.equal(p.operation,'recall');assert.equal(p.from,new Date().getUTCFullYear()+'-04-03');assert.equal(p.to,new Date().getUTCFullYear()+'-04-10');
 const sources=[{text:'First note.',occurredAt:'2026-04-03',petId:'a'},{text:'Second note.',occurredAt:'2026-04-09',petId:'a'}];
 assert.equal(historyNarrativeAnchorsSupported('Six days.',sources,q),true);
 assert.equal(historyNarrativeAnchorsSupported('Seven days.',sources,q),false);
});
test('simple reformulation keeps the dated user question without accepting assistant-only authority',()=>{
 const prior="Does the April 3 note describe one accident or two? It is Pip's note.";
 assert.equal(datedNoteReformulation(context('Say that more simply.',[prior])).petId,'a');
 const c=context('Say that more simply.');c.conversationTurns=[{role:'assistant',text:prior}];
 assert.equal(datedNoteReformulation(c),null);
 assert.equal(datedNoteReformulation(context('Say that more simply. Pip vomited today.',[prior])),null);
});
test('which-sign question does not invent a literal symptom filter',()=>{
 const p=normalizeAskReadProposal(proposal('recall'),context('Which Pip symptom is explicitly recorded as returning after late March?'));
 assert.deepEqual(p.terms,[]);
 const specific=normalizeAskReadProposal(proposal('recall'),context('What did the notes say about itching returning?'));
 assert.deepEqual(specific.terms,['accident']);
});

test('which-pet saved-weight lookup resolves the bounded owned account, not a generic missing subject',()=>{
 const c=context('Which pet has both April and August weight notes at 4.2 kg?');
 c.eligiblePets.push({id:'b',name:'Fern',user_id:'owner'},{id:'x',name:'Other',user_id:'someone-else'});
 const p=normalizeAskReadProposal({...proposal('general'),subject:'non_pet',petNames:[]},c);
 assert.equal(p.operation,'comparison');assert.equal(p.subject,'explicit');assert.deepEqual(p.petNames,['Pip','Fern']);assert.deepEqual(p.frame.claims,[]);
 const unrelated=normalizeAskReadProposal({...proposal('general'),subject:'non_pet',petNames:[]},context('Which pet should a friend adopt?'));
 assert.equal(unrelated.subject,'non_pet');
});

test('explicit interval endpoints override a valid but wrong model range without accepting invalid dates',()=>{
 const c=context("How many days separate Pip's April 3 and April 9 notes?");
 const p=normalizeAskReadProposal({...proposal('recall'),from:'2026-05-01',to:'2026-05-02'},c);
 assert.equal(p.from,new Date().getUTCFullYear()+'-04-03');assert.equal(p.to,new Date().getUTCFullYear()+'-04-10');assert.deepEqual(p.terms,[]);
 const invalid=normalizeAskReadProposal({...proposal('recall'),from:'2026-02-30',to:'2026-03-01'},c);
 assert.equal(invalid.from,'2026-02-30');
});


test('calendar endpoint reads do not depend on the model choosing recall',()=>{
 const c=context("How many days separate Pip's April 3 and April 9 notes?");
 for(const operation of ['comparison','overview','status','recall','count']) {
  const p=normalizeAskReadProposal({...proposal(operation),from:'2026-05-01',to:'2026-05-02'},c);
  assert.equal(p.operation,'recall',operation);assert.equal(p.readOperation,'recall');
  assert.equal(p.from,new Date().getUTCFullYear()+'-04-03');assert.equal(p.to,new Date().getUTCFullYear()+'-04-10');assert.deepEqual(p.terms,[]);
 }
 for(const q of [c.currentMessage+' Pip vomited today.', 'How many days separate April 3 and April 9, and how many episodes were there?']) {
  const p=normalizeAskReadProposal(proposal('comparison'),context(q));
  assert.equal(p.operation,'comparison');
 }
 const foreign=normalizeAskReadProposal({...proposal('comparison'),petNames:['Unowned']},c);
 assert.deepEqual(foreign.petNames,['Unowned']);
});

test('broad recorded food resets stale weight terms but preserves ingredient-specific and malformed filters',()=>{
 const p=normalizeAskReadProposal({...proposal('comparison'),terms:['weigh']},context("Give a separate line for each pet's recorded food: Pip."));
 assert.ok(p.terms.includes('food'));assert.ok(!p.terms.includes('weigh'));
 for(const q of ['Compare recorded food and weight for Pip.','Which recorded food contained chicken?']) {
 const p=normalizeAskReadProposal({...proposal('comparison'),terms:['weigh']},context(q));assert.deepEqual(p.terms,['weigh']);
 }
 const bad=normalizeAskReadProposal({...proposal('comparison'),terms:['DROP;TABLE']},context('List recorded food for Pip.'));assert.deepEqual(bad.terms,['DROP;TABLE']);
});

test('literal four-date timeline cannot become general or latest-only',()=>{
 const q='For Pip, list June 15, June 20, August 8 and August 10 in chronological order.';
 for(const operation of ['general','recall','comparison','status']) {
  const p=normalizeAskReadProposal({...proposal(operation),selection:'latest',from:new Date().getUTCFullYear()+'-08-10',to:new Date().getUTCFullYear()+'-08-11'},context(q));
  assert.equal(p.operation,'recall');assert.equal(p.selection,'period');assert.deepEqual(p.terms,[]);
  assert.equal(p.from,new Date().getUTCFullYear()+'-06-15');assert.equal(p.to,new Date().getUTCFullYear()+'-08-11');
 }
 const bad={...proposal('recall'),terms:['%']};assert.deepEqual(normalizeAskReadProposal(bad,context(q)),bad);
});
test('causal change reference inherits only the last explicit owned user question',()=>{
 const q='Does that tell us which change caused the improvement?';
 const prior="What did Pip's July 9 vet recommend, and what was changed on July 10?";
 const p=normalizeAskReadProposal({...proposal('clarify'),subject:'unclear',petNames:[]},context(q,[prior]));
 assert.equal(p.operation,'recall');assert.deepEqual(p.petNames,['Pip']);assert.deepEqual(p.terms,[]);
 for(const previous of [prior.replace('Pip','Bruno'),prior+' Pip vomited.',prior+' and Bruno?','Which pet was that?']) {
  const initial={...proposal('clarify'),subject:'unclear',petNames:[]};
  assert.equal(normalizeAskReadProposal(initial,context(q,[previous])).operation,'clarify');
 }
});
test('explicit named correction lookup excludes the external name from authority',()=>{
 const p=normalizeAskReadProposal({...proposal('clarify'),petNames:['Pip','Bruno'],subject:'unclear'},context('What does the August 20 correction say about Pip and Bruno?'));
 assert.equal(p.operation,'recall');assert.deepEqual(p.petNames,['Pip']);assert.deepEqual(p.terms,['correct','retract']);
});
