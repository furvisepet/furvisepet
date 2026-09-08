import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedWeightGrams} from '../app/lib/intelligence/recorded-weight.ts';
test('an unambiguous weight sentence later in the named pet note is extracted',()=>{
 assert.equal(recordedWeightGrams('Fern still hides during drilling. Her appetite is normal. Her weight today was 4.2 kg.','Fern'),4200);
 assert.equal(recordedWeightGrams('Fern weighed 4.2 kg today. She eats normally.','Fern'),4200);
});
test('competing subjects, uncertain measurements and conflicting quantities stay unsupported',()=>{
 for(const note of ['Fern was with Pip. Her weight today was 4.2 kg.','Fern saw my sister. Her weight today was 4.2 kg.','Fern was quiet. Her weight today may have been 4.2 kg.','Fern weighed 4.2 kg. Her weight today was 4.3 kg.','Fern did not weigh 4.2 kg.']) assert.equal(recordedWeightGrams(note,'Fern'),null);
});
