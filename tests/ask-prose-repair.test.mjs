import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProseRepair } from '../app/lib/intelligence/history-prose-repair.ts';
const draft = {sentences: [
  {text:'A saved note records 15 kg.',sourceIds:['care:weight']},
  {text:'Redness returned.',sourceIds:['request:current']},
]};
const replacement = {index:1,text:'You report that redness returned.',sourceIds:['request:current'],calculations:[]};
test('one attribution repair preserves every untouched claim and original draft',()=>{
  const before=structuredClone(draft), result=applyProseRepair(draft,{replacements:[replacement]});
  assert.deepEqual(result.sentences[0],draft.sentences[0]);
  assert.equal(result.sentences[1].text,replacement.text);
  assert.equal(result.sentences.length,2);
  assert.deepEqual(draft,before);
});
test('invalid patches cannot drop, append, reorder, or introduce action authority',()=>{
  for(const value of [
    {replacements:[]}, {replacements:[replacement,replacement]},
    {replacements:[{...replacement,index:2}]}, {replacements:[{...replacement,index:-1}]},
    {replacements:[{...replacement,index:'1'}]}, {replacements:[{...replacement,sourceIds:[]}]},
    {replacements:[replacement],applicationActions:[]},
  ]) assert.throws(()=>applyProseRepair(draft,value));
});
