import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAskReadProposal } from '../app/lib/intelligence/ask-plan-recovery.ts';
import { emptyProposedSemanticFrame } from '../app/lib/intelligence/semantic-frame/extract-frame.ts';
const pets = [{ id:'a', name:'Pip', user_id:'owner', species:'dog' }, { id:'b', name:'Fern', user_id:'owner', species:'cat' }];
const turn = text => ({ role:'user', text });
const context = (message='Do we know its name?', texts=['Now focus on Fern.', 'Did she finish that medication?']) => ({
  owner:{userId:'owner'}, pet:pets[0], eligiblePets:pets, currentMessage:message, conversationTurns:texts.map(turn) });
const proposal = () => ({operation:'clarify',readOperation:'clarify',subject:'unclear',petNames:[],topic:'medication',terms:[],
  from:null,to:null,episodeTopic:null,ordinal:null,selection:'summary',frame:emptyProposedSemanticFrame()});
for (const q of ['Do we know its name?', 'What was it called?', 'What is its dose?', 'Is its name recorded?', 'Do the notes name it?']) {
  test(`medication reference: ${q}`, () => {
    const p=normalizeAskReadProposal(proposal(),context(q));
    assert.equal(p.operation,'recall');assert.deepEqual(p.petNames,['Fern']);
    assert.deepEqual(p.terms,['medic','prescri','course']);assert.deepEqual(p.frame.claims,[]);
  });
}
for (const [label,texts] of [
  ['no user anchor',[]], ['two pets',['Pip and Fern take medication.']],
  ['two medicines',['Fern took two medications.']],
  ['ambiguous earlier medicines',['Fern took two medications.','Did she finish that medication?']],
  ['changed topic',['Fern finished the medication.','What about her food?']],
  ['changed pet',['Fern finished the medication.','Now focus on Pip.']],
  ['person question',['Fern finished the medication.','Did my friend finish that medication?']],
]) test(`preserve clarification: ${label}`,()=>assert.equal(normalizeAskReadProposal(proposal(),context(undefined,texts)).operation,'clarify'));
test('assistant words cannot establish medication or pet authority',()=>{
  const c=context(undefined,[]);c.conversationTurns=[{role:'assistant',text:'Fern finished the medication.'}];
  assert.equal(normalizeAskReadProposal(proposal(),c).operation,'clarify');
});
for (const patch of [{petNames:['Pip']},{petNames:['Foreign']},{from:'2026-01-01',to:'2026-02-01'},{ordinal:'second'},{terms:['SQL;']},{operation:'update',readOperation:null}]) {
  test(`does not recover conflicting metadata ${JSON.stringify(patch)}`,()=>{
    const p=normalizeAskReadProposal({...proposal(),...patch},context());
    assert.notDeepEqual(p.petNames,['Fern']);
  });
}
test('mutation and dosage-advice requests do not become reference reads',()=>{
  for(const q of ['Save its name.', 'Can I double its dose?', 'Its name is aspirin.', 'What is its name? Save it.'])
    assert.notDeepEqual(normalizeAskReadProposal(proposal(),context(q)).petNames,['Fern']);
});
