import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOwnerAssertions } from '../app/lib/ai/owner-assertion.ts';
import { classifyUserTurn } from '../app/lib/ai/turn-classifier.ts';
import { historyNarrativeAnchorsSupported } from '../app/lib/intelligence/history-narrative-facts.ts';
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

test('shared month dates retain both literal days and the trailing year',async()=>{
 const {explicitHistoryDays}=await import('../app/lib/intelligence/history-dates.ts');
 assert.deepEqual(explicitHistoryDays('September 13 and 14 entries',2026),['2026-09-13','2026-09-14']);
 assert.deepEqual(explicitHistoryDays('September 13 and 14, 2023 notes',2026),['2023-09-13','2023-09-14']);
 assert.deepEqual(explicitHistoryDays('February 28 and 30 entries',2026),[]);
 assert.deepEqual(explicitHistoryDays('September 13 and 14 kg',2026),['2026-09-13']);
});
test('missing recorded diagnosis cannot become a clinical nonoccurrence claim',()=>{
 const sources=[{text:'I have not recorded a diagnosis or new medication instructions here.',petId:'a'}];
 for(const text of ['The visit did not establish a diagnosis.','No diagnosis was made.','Pip was not diagnosed.'])
  assert.equal(historyNarrativeAnchorsSupported(text,sources),false,text);
 assert.equal(historyNarrativeAnchorsSupported('No diagnosis was recorded in the note.',sources),true);
 assert.equal(historyNarrativeAnchorsSupported('The vet did not establish a diagnosis.',[{text:'The vet did not establish a diagnosis.'}]),true);
});
