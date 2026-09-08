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


test('unambiguous present-tense recorded measurement supports the same strict extraction',()=>{
 assert.equal(recordedWeightGrams('Pip walks comfortably. He weighs 7.1 kg.','Pip'),7100);
 assert.equal(recordedWeightGrams('Fern rests normally. She weighs 4.2 kg today.','Fern'),4200);
 for(const note of ['Pip saw Fern. He weighs 7.1 kg.','Pip saw another dog. He weighs 7.1 kg.','Pip may weigh 7.1 kg.','Pip walks normally. He might weigh 7.1 kg.','Pip weighs 7.1 kg. He weighed 7.2 kg before.','Pip walks normally. He weighs 7.1 kg, estimated.']) assert.equal(recordedWeightGrams(note,'Pip'),null,note);
});

test('a measured clause after ordinary observations keeps ownership and uncertainty boundaries',()=>{
 assert.equal(recordedWeightGrams('Pip enjoys short walks. He occasionally hesitates. His appetite is normal and he weighs 7.1 kg.','Pip'),7100);
 for(const note of ['Pip saw my sister and he weighs 7.1 kg.','Pip might be eating normally and he weighs 7.1 kg.','Pip saw Fern and she weighs 7.1 kg.','Pip is normal. I guess he weighs 7.1 kg.']) assert.equal(recordedWeightGrams(note,'Pip'),null);
});
