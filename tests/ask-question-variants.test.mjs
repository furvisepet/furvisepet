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
