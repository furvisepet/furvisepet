import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitHistoryDays} from '../app/lib/intelligence/history-dates.ts';
import {compileHistoryReadStrategies} from '../app/lib/intelligence/history-read-strategies.ts';

const window = {from:'2018-01-01T00:00:00.000Z',to:'2027-01-01T00:00:00.000Z'};
const broad = {...window,descending:true,lexical:false,terms:[]};
const cases = [
 ['English day first','Compare 18 May 2018 and 21 May 2026.'],
 ['Spanish','Compara el 18 de mayo de 2018 y el 21 de mayo de 2026.'],
 ['French','Compare le 18 mai 2018 et le 21 mai 2026.'],
 ['German','Vergleiche den 18. Mai 2018 und den 21. Mai 2026.'],
 ['Arabic','قارن 18 مايو 2018 و21 مايو 2026.'],
 ['Japanese','2018年5月18日と2026年5月21日を比較してください。'],
];
for (const [language,question] of cases) test(`${language}: eight-year dated retrieval reserves both named days and broad context`,()=>{
 assert.deepEqual(explicitHistoryDays(question,2026,8),['2018-05-18','2026-05-21']);
 const result=compileHistoryReadStrategies(question,2026,window,[broad],4);
 assert.deepEqual(result.strategies.filter(s=>s.target).map(s=>s.target),['2018-05-18','2026-05-21']);
 assert.deepEqual(result.strategies.at(-1),broad);
});
test('a shared Spanish month and year retains both days',()=>{
 assert.deepEqual(explicitHistoryDays('Resume las notas del 18 y del 21 de mayo de 2023.',2026,8),['2023-05-18','2023-05-21']);
});
test('invalid dates and ambiguous numeric dates never become literal anchors',()=>{
 for (const q of ['31 de febrero de 2024','31. Februar 2024','2023年2月29日','05/06/2024']) assert.deepEqual(explicitHistoryDays(q,2026,8),[]);
});
test('localized targets cannot widen access or displace broad context beyond query allowance',()=>{
 const narrow={from:'2020-01-01T00:00:00.000Z',to:'2025-01-01T00:00:00.000Z'};
 const result=compileHistoryReadStrategies('18 de mayo de 2018, 21 de mayo de 2023, 22 de mayo de 2024 y 21 de mayo de 2026',2026,narrow,[{...broad,...narrow}],2);
 assert.equal(result.strategies.length,2);
 assert.deepEqual(result.omittedTargets,['2024-05-22']);
 for(const s of result.strategies) {assert.ok(Date.parse(s.from)>=Date.parse(narrow.from));assert.ok(Date.parse(s.to)<=Date.parse(narrow.to));}
});

test('localized month requests retain separate queries across eight years',()=>{
 for(const question of ['mayo de 2018 y mayo de 2026','mai 2018 et mai 2026','Mai 2018 und Mai 2026','مايو 2018 ومايو 2026','2018年5月と2026年5月']) {
  const result=compileHistoryReadStrategies(question,2026,window,[broad],4);
  assert.deepEqual(result.strategies.filter(s=>s.target).map(s=>s.target),['2018-05','2026-05'],question);
 }
});

test('Arabic digits and leap-day validation preserve exact dates',()=>{
 assert.deepEqual(explicitHistoryDays('٢٩ فبراير ٢٠٢٤',2026,8),['2024-02-29']);
 assert.deepEqual(explicitHistoryDays('۲۹ فبراير ۲۰۲۴',2026,8),['2024-02-29']);
 assert.deepEqual(explicitHistoryDays('٢٩ فبراير ٢٠٢٣',2026,8),[]);
});
