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

for (const operation of ['general', 'recall', 'status', 'overview']) {
  test(`medication referent survives a confident but unrelated ${operation} plan`, () => {
    const p = normalizeAskReadProposal({...proposal(), operation, readOperation:operation,
      subject:'conversation',petNames:['Fern'],topic:'pet name',terms:['name']},context());
    assert.equal(p.operation,'recall');
    assert.deepEqual(p.petNames,['Fern']);
    assert.equal(p.topic,'medication details');
    assert.deepEqual(p.terms,['medic','prescri','course']);
    assert.deepEqual(p.frame.claims,[]);
  });
}
test('clear medication reference cannot be answered as generic conversation', () => {
  const p=normalizeAskReadProposal({...proposal(),operation:'general',readOperation:'general',
    subject:'non_pet',topic:'name',terms:[]},context());
  assert.equal(p.operation,'recall');
  assert.deepEqual(p.petNames,['Fern']);
});
test('confident reference recovery preserves competing treatment uncertainty', () => {
  const input={...proposal(),operation:'recall',readOperation:'recall',subject:'conversation',
    petNames:['Fern'],topic:'name',terms:['name']};
  const p=normalizeAskReadProposal(input,context(undefined,
    ['Fern took two medications.','Did she finish that medication?']));
  assert.deepEqual(p,input);
});

for (const patch of [
  {from:'2026-02-01',to:'2026-03-01'}, {ordinal:'second'}, {terms:['SQL;']},
]) test('generic normalization cannot erase conflicting reference metadata: '+JSON.stringify(patch),()=>{
  const p=normalizeAskReadProposal({...proposal(),operation:'general',readOperation:'general',
    subject:'non_pet',...patch},context());
  assert.notEqual(p.topic,'medication details');
});

test('complete thanks has no pet or history authority even after ambiguous dialogue',()=>{
 for(const q of ['Thanks, that helps.','Thank you!','Thx','Thanks so much!']) {
 const p=normalizeAskReadProposal(proposal(),context(q,['Pip and Fern took medication.']));
 assert.equal(p.operation,'general');assert.equal(p.subject,'non_pet');assert.deepEqual(p.petNames,[]);assert.deepEqual(p.terms,[]);assert.deepEqual(p.frame.claims,[]);
 }
});
test('thanks prefix cannot swallow a question or owner observation',()=>{
 for(const q of ['Thanks, but she is vomiting.','Thanks. What is its dose?','Thanks, save this.'])
 assert.notEqual(normalizeAskReadProposal(proposal(),context(q)).subject,'non_pet');
});

test('which animal a correction describes is an account-scoped read',()=>{
 const p=normalizeAskReadProposal({...proposal(),operation:'general',readOperation:'general',subject:'non_pet'},context('Which dog was the August vomiting correction about?'));
 assert.equal(p.operation,'recall');assert.deepEqual(p.petNames,['Pip','Fern']);assert.deepEqual(p.terms,['correct','retract']);assert.deepEqual(p.frame.claims,[]);
 const write=normalizeAskReadProposal({...proposal(),operation:'update',readOperation:null},context('Correct the vomiting note to Pip.'));
 assert.notDeepEqual(write.terms,['correct','retract']);
});
