import assert from 'node:assert/strict';
import test from 'node:test';

test('difference binding selects the unique requested measurement when notes contain unrelated measurements', async () => {
  const {attachDeterministicCalculationBindings}=await import('../app/lib/intelligence/repair-calculation-bindings.ts');
  const sources=[
    {sourceId:'care:old',text:'Cedar weighed 12.61 kg. Puzzle-feeder time averaged 9 minutes this month.',occurredAt:'2021-07-15T12:00:00Z'},
    {sourceId:'care:new',text:'Cedar weighed 13.76 kg. Puzzle-feeder time averaged 14 minutes this month.',occurredAt:'2024-07-15T12:00:00Z'},
  ];
  const narrative={sentences:[{text:'Cedar\'s puzzle-feeder time increased by 5 minutes.',sourceIds:['care:old','care:new'],calculations:[]}]};
  const result=attachDeterministicCalculationBindings(narrative,sources,'Compare Cedar\'s puzzle-feeder time in July 2021 with July 2024. Give both recorded times and the exact change in minutes.');
  assert.equal(result.sentences[0].calculations.length,1);
  const calculation=result.sentences[0].calculations[0];
  assert.equal(calculation.operation,'absolute_difference');
  assert.equal(calculation.value,5);
  assert.equal(calculation.unit,'minute');
  assert.deepEqual(calculation.operands.map(o=>o.literal),['9 minutes','14 minutes']);
});

test('difference binding refuses ambiguous same-unit candidate pairs', async () => {
  const {attachDeterministicCalculationBindings}=await import('../app/lib/intelligence/repair-calculation-bindings.ts');
  const sources=[
    {sourceId:'care:old',text:'Walks lasted 9 minutes and play lasted 19 minutes.'},
    {sourceId:'care:new',text:'Walks lasted 14 minutes and play lasted 24 minutes.'},
  ];
  const narrative={sentences:[{text:'The change was 5 minutes.',sourceIds:['care:old','care:new'],calculations:[]}]};
  const result=attachDeterministicCalculationBindings(narrative,sources,'What was the exact change in minutes?');
  assert.deepEqual(result.sentences[0].calculations,[]);
});

test('invalid provider calculation metadata is replaced by unique server-grounded proof', async () => {
  const {attachDeterministicCalculationBindings}=await import('../app/lib/intelligence/repair-calculation-bindings.ts');
  const sources=[
    {sourceId:'care:old',text:'Cedar weighed 12.61 kg. Puzzle-feeder time averaged 9 minutes this month.',occurredAt:'2021-07-15T12:00:00Z'},
    {sourceId:'care:new',text:'Cedar weighed 13.76 kg. Puzzle-feeder time averaged 14 minutes this month.',occurredAt:'2024-07-15T12:00:00Z'},
  ];
  const bad={operation:'difference',expression:null,operands:[
    {sourceId:'care:old',field:'text',literal:'9 minutes'},
    {sourceId:'care:new',field:'text',literal:'14 minutes'},
  ],value:5,unit:'minute'};
  const narrative={sentences:[{text:'Cedar\'s puzzle-feeder time increased by 5 minutes.',sourceIds:['care:old','care:new'],calculations:[bad]}]};
  const result=attachDeterministicCalculationBindings(narrative,sources,'Compare Cedar\'s puzzle-feeder time in July 2021 with July 2024. Give both recorded times and the exact change in minutes.');
  assert.equal(result.sentences[0].calculations.length,1);
  assert.equal(result.sentences[0].calculations[0].operation,'absolute_difference');
  assert.equal(result.sentences[0].calculations[0].value,5);
  assert.deepEqual(result.sentences[0].calculations[0].operands.map(o=>o.literal),['9 minutes','14 minutes']);
});
