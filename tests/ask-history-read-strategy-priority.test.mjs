import assert from 'node:assert/strict';
import test from 'node:test';
import {compileHistoryReadStrategies} from '../app/lib/intelligence/history-read-strategies.ts';

test('two explicit comparison months consume a two-query budget before broad context',()=>{
  const proposed=[{from:'2016-10-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z',descending:true,lexical:true,terms:['puzzle','feeder']}];
  const result=compileHistoryReadStrategies(
    "Compare Cedar's puzzle-feeder time in July 2021 with July 2024. Give both recorded times and the exact change in minutes.",
    2026,
    {from:'2016-10-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'},
    proposed,
    2,
    [],
    'UTC',
    false,
  );
  assert.deepEqual(result.strategies.map(x=>x.target),['2021-07','2024-07']);
  assert.deepEqual(result.omittedTargets,[]);
});

test('broad context uses only capacity left after explicit targets',()=>{
  const proposed=[
    {from:'2016-10-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z',descending:true,lexical:true,terms:['puzzle']},
    {from:'2016-10-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z',descending:false,lexical:false,terms:[]},
  ];
  const result=compileHistoryReadStrategies(
    "Compare Cedar's puzzle-feeder time in July 2021 with July 2024.",
    2026,
    {from:'2016-10-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'},
    proposed,
    3,
    [],
    'UTC',
    false,
  );
  assert.equal(result.strategies[0].target,'2021-07');
  assert.equal(result.strategies[1].target,'2024-07');
  assert.equal(result.strategies.length,3);
});
