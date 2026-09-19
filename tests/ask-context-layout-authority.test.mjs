import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAskAnswerEconomy, planAskAnswerDepth, normalizeAskVisibleProseSanity, normalizeRequestedQuestionList } from '../app/lib/ai/ask-answer-economy.ts';
import { classifyCurrentPetLoss } from '../app/lib/ai/pet-loss.ts';

test('explicit output containers survive low-depth economy without collapsing rows or list items', () => {
  const depth=planAskAnswerDepth({message:'Thanks',intent:'casual'});
  for(const summary of ['field,value\n"Name, suffix",7\nOther,9','First line\nSecond line','- First observation\n- Second observation\n- Unknown cause','{"dose":null,"known":false}']) {
    const answer={summary,sections:[],safetyNote:null};
    assert.equal(applyAskAnswerEconomy(answer,depth,{preserveFormat:true}).summary,summary);
  }
});
test('quotes do not establish a lifecycle event but an independent genuine report survives', () => {
  assert.equal(classifyCurrentPetLoss('Translate "the cat passed away" into Italian.'),'none');
  assert.equal(classifyCurrentPetLoss('In a script, “the animal died” is a line of dialogue.'),'none');
  assert.equal(classifyCurrentPetLoss('The article says "a dog died". My cat passed away last night.'),'confirmed_current');
  assert.equal(classifyCurrentPetLoss('My cat passed away last night.'),'confirmed_current');
  assert.equal(classifyCurrentPetLoss('I think my cat may have died.'),'uncertain_current');
});

test('visible prose house style removes em dashes without changing the factual sentence',()=>{
  const answer={summary:'Aster — weighed 30.31 kg. It was stable — with no new concern.',sections:[],safetyNote:null};
  const normalized=normalizeAskVisibleProseSanity(answer);
  assert.doesNotMatch(normalized.summary,/—/);
  assert.match(normalized.summary,/Aster: weighed 30\.31 kg/);
  assert.match(normalized.summary,/stable, with no new concern/);
});

test('explicit three-question request becomes three separate vet question items',()=>{
  const answer={summary:'From the notes, Aster skipped breakfast and was slower on the evening walk. Three questions to ask the vet: 1. Does skipping breakfast once suggest anything important to watch for? 2. Should I track the slower evening walk? 3. What signs would mean I should call sooner?',sections:[],safetyNote:null};
  const normalized=normalizeRequestedQuestionList(answer,'I have a checkup for Aster on Friday. From my notes, what changed since the last visit, and give me 3 questions for the vet. Don\'t diagnose.');
  assert.match(normalized.summary,/Aster skipped breakfast/);
  assert.equal(normalized.sections.length,1);
  assert.equal(normalized.sections[0].heading,'Questions for the vet');
  assert.equal(normalized.sections[0].items.length,3);
  assert.doesNotMatch(normalized.summary,/\b1\./);
});
