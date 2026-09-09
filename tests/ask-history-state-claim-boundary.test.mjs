import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceVerifiedStateClaims, containsUnverifiedStateClaim } from '../app/lib/application-actions/state-claims.ts';

const caveat = 'This covers the matching saved notes I could verify, not necessarily every event in their life.';
test('physical care changes survive mutation governance instead of leaving only a disclaimer', () => {
  for (const fact of [
    'Her litter was changed to scented litter on July 5.',
    'His main food was changed gradually in March.',
    'The medication course was completed on June 24.',
    'The treatment course has been completed.'
  ]) {
    assert.equal(enforceVerifiedStateClaims(fact + ' ' + caveat, false), fact + ' ' + caveat);
    assert.equal(containsUnverifiedStateClaim(fact), false);
  }
});
test('care vocabulary cannot hide an assistant or stored-data mutation claim', () => {
  for (const claim of [
    'I changed her food.', 'We completed the medication course.',
    'Her food was changed in her profile.', 'Her diet was changed by Furvise.',
    'In her profile, her food was changed.', 'The record of her food was changed.',
    'The medication course was completed in the record.',
    'Her litter preference was changed.', 'The preferred language was changed to English.',
    'Her profile was updated.', 'It was saved.',
    'Her litter was changed and her history was deleted.'
  ]) {
    assert.equal(containsUnverifiedStateClaim(claim), true, claim);
    assert.equal(containsUnverifiedStateClaim(enforceVerifiedStateClaims(claim, false)), false, claim);
  }
});

test('negative vet-record facts and animal-subject diet transitions retain their answer',()=>{
 for(const fact of [
  'The August 27 vet note says no new medication or diagnosis was recorded.',
  'No medication name or dose was recorded in the June 17 note.',
  'Luna was changed from chicken wet food to turkey complete adult wet food.',
  'She was changed to turkey complete adult wet food on August 2.'
 ]) assert.equal(enforceVerifiedStateClaims(fact+' '+caveat,false),fact+' '+caveat);
});
test('historical vocabulary cannot disguise a profile write or a mixed mutation',()=>{
 for(const claim of [
  'Her profile was changed to turkey complete adult wet food.',
  'She was changed to turkey food in her profile.',
  'No diagnosis was recorded, and her profile was updated.',
  'No medication was recorded by Furvise.',
  'I recorded no new medication.',
  'We changed her to turkey food.'
 ]) assert.equal(containsUnverifiedStateClaim(claim),true,claim);
});

test('capability limitations and dated measurements are not offers or write receipts', () => {
  for (const text of [
    "I can't recover those records under the current history window.",
    'I can establish only what the supplied notes record.',
    'Aster was recorded to weigh 18.6 kg on April 12.',
    'The return to the previous arrangement was recorded on April 9.',
  ]) assert.equal(enforceVerifiedStateClaims(text, false), text);
  for (const text of ['I can help you save that.', 'If you want, I can record that.', 'Would you like me to prepare a summary?'])
    assert.equal(enforceVerifiedStateClaims(text, false), 'I can help with that.');
  for (const text of ['Her profile was recorded on April 12.', 'Aster was recorded on April 12 by Furvise.', 'I recorded her weight on April 12.'])
    assert.equal(containsUnverifiedStateClaim(text), true);
});

test('reporting language does not require a date to survive every final prose guard', () => {
  for (const text of ['A seven-day course was recorded, but its name is unavailable.',
    'The measurement was recorded as 8.3 kg.', 'The duration was recorded in the clinical note.'])
    assert.equal(enforceVerifiedStateClaims(text, false), text);
  for (const text of ['The profile was recorded.', 'I recorded the measurement.',
    'The measurement was recorded in your history.', 'The measurement was just recorded.',
    'The measurement was recorded by Furvise.']) assert.equal(containsUnverifiedStateClaim(text), true);
});

test('negative saved-detail answers are not successful mutation receipts', () => {
  const text='No numeric dose was saved for the medication; the clinical note says its dose is unavailable.';
  assert.equal(enforceVerifiedStateClaims(text,false),text);
  assert.equal(containsUnverifiedStateClaim('No numeric dose was saved; her profile was updated.'),true);
});

test('attribution prefixes and dated physical completion survive without creating action authority', () => {
 for(const text of ['The later record says no reason for the difference was recorded, so the records do not explain why.',
   'The transition started on April 3, and it was completed on April 10.',
   'The scheduled session was completed on April 12.']) assert.equal(enforceVerifiedStateClaims(text,false),text);
 for(const text of ['The note says her profile was updated.', 'The request was completed on April 12.',
   'It was completed on April 12.', 'The transition was completed in her profile on April 12.'])
   assert.equal(containsUnverifiedStateClaim(text),true,text);
});


test('offer filtering retains a capability boundary in a mixed sentence', () => {
  const value = 'I can help generally, but I cannot access hidden records. Paste the text if you have it.';
  assert.equal(enforceVerifiedStateClaims(value, false), value);
});
