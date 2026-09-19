import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCurrentPetLoss, resolveProviderIndependentLossSubject } from '../app/lib/ai/pet-loss.ts';

const pets=[
  {id:'aster',name:'Aster',species:'dog',lifecycle_status:'active'},
  {id:'bramble',name:'Bramble',species:'cat',lifecycle_status:'active'},
  {id:'cedar',name:'Cedar',species:'dog',lifecycle_status:'active'},
  {id:'dune',name:'Dune',species:'cat',lifecycle_status:'active'},
];

const screenshot1="For every pet I've ever had, including ones that died, what's the last thing I saved — even if it's dated tomorrow — and did that save change their current food, weight, or whether they're still alive? If anything isn't in the file, say it isn't. Don't use profile defaults.";
const screenshot2="Don't save anything. Nobody died in this message. For Aster, Bramble, Cedar, and Dune, list the last care-history receipt only. Include future-dated saves. Say if food, weight, or alive status changed in that receipt. If a pet has no death record, say that pet is not recorded as deceased.";

test('account-wide history queries mentioning death do not become loss assertions',()=>{
  assert.equal(classifyCurrentPetLoss(screenshot1),'none');
  assert.equal(classifyCurrentPetLoss(screenshot2),'none');
  assert.equal(resolveProviderIndependentLossSubject({message:screenshot1,pets,selectedPetId:'aster'}),null);
  assert.equal(resolveProviderIndependentLossSubject({message:screenshot2,pets,selectedPetId:'aster'}),null);
});

test('negated, read-only, hypothetical, and uncertain death language cannot confirm lifecycle loss',()=>{
  for(const message of [
    'Nobody died today.',
    'No one died in this message.',
    'None of my pets died.',
    "Buddy didn't die.",
    'Buddy did not die.',
    'Show me which pets died.',
    'Which pet died?',
    'Has any pet died?',
    'If Buddy died years ago, would it be in history?',
    'Tell me whether Buddy died.',
    'If a pet has no death record, say not deceased.',
    "Don't save anything; I am only asking whether a death was recorded.",
  ]) assert.notEqual(classifyCurrentPetLoss(message),'confirmed_current',message);
  assert.equal(classifyCurrentPetLoss('I think my cat may have died.'),'uncertain_current');
});

test('clear affirmative owner loss reports still confirm',()=>{
  for(const message of [
    'Aster died yesterday.',
    'My cat passed away last night.',
    'He died this morning.',
    'One of my pets died yesterday.',
    'My dog was put to sleep yesterday.',
  ]) assert.equal(classifyCurrentPetLoss(message),'confirmed_current',message);
});

import { isGriefAskTone } from '../app/lib/ask-experience.ts';

test('read-only death language does not force grief presentation',()=>{
  assert.equal(isGriefAskTone(screenshot1),false);
  assert.equal(isGriefAskTone(screenshot2),false);
  assert.equal(isGriefAskTone('Show me which pets died.'),false);
  assert.equal(isGriefAskTone('Aster died yesterday.'),true);
});
