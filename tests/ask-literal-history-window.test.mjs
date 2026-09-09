import assert from 'node:assert/strict';
import test from 'node:test';
import {literalHistoryMonthWindow as window} from '../app/lib/intelligence/literal-history-window.ts';
test('literal calendar months retain their full leap-year and year-boundary range',()=>{
 assert.deepEqual(window('Explain the February 2024 observations.'),{from:'2024-02-01',to:'2024-03-01'});
 assert.deepEqual(window('Read December 2023.'),{from:'2023-12-01',to:'2024-01-01'});
 assert.deepEqual(window('Compare October 2022 and January 2023 readings.'),{from:'2022-10-01',to:'2023-02-01'});
});
test('literal fallback does not replace open bounds or an unspecified comparison endpoint',()=>{
 for(const q of ['Since February 2024','Before December 2023','Compare February 2024 with the latest reading','From January 2023 until now','Read 2024-02-14'])assert.equal(window(q),null);
});
