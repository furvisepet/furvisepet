import assert from 'node:assert/strict';
import test from 'node:test';
import {literalHistoryMonthWindow as window, literalHistoryReportDayWindow as dayWindow} from '../app/lib/intelligence/literal-history-window.ts';
test('literal calendar months retain their full leap-year and year-boundary range',()=>{
 assert.deepEqual(window('Explain the February 2024 observations.'),{from:'2024-02-01',to:'2024-03-01'});
 assert.deepEqual(window('Read December 2023.'),{from:'2023-12-01',to:'2024-01-01'});
 assert.deepEqual(window('Compare October 2022 and January 2023 readings.'),{from:'2022-10-01',to:'2023-02-01'});
});
test('literal fallback does not replace open bounds or an unspecified comparison endpoint',()=>{
 for(const q of ['Since February 2024','Before December 2023','Compare February 2024 with the latest reading','From January 2023 until now','Read 2024-02-14'])assert.equal(window(q),null);
});

test('dated report fallback retains a valid exact day and an exclusive next-day bound', () => {
 for (const text of ['Explain the February 29, 2024 note.', 'Read the Feb. 29th 2024 entry.', 'What does the 2024-02-29 report say?'])
  assert.deepEqual(dayWindow(text), {from:'2024-02-29',to:'2024-03-01'});
 assert.deepEqual(dayWindow('Separate note and observation dates in the December 31, 2023 record.'), {from:'2023-12-31',to:'2024-01-01'});
});
test('report-day recovery declines invalid, underspecified and multi-period requests', () => {
 for (const text of ['Read the February 29, 2023 note.', 'Read the 2024-13-02 report.', 'Read the February 31, 2024 entry.',
  'Read the February 29 note.', 'Read the 2024-02-29 and 2024-03-01 reports.',
  'Compare the 2024-02-29 note with the earlier note.', 'What happened after the 2024-02-29 report?',
  'What does the latest note say as of 2024-02-29?', 'What happened on 2024-02-29?']) assert.equal(dayWindow(text),null,text);
});
