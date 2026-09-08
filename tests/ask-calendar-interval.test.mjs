import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedCalendarInterval} from '../app/lib/intelligence/calendar-interval.ts';
test('calendar arithmetic validates dates and leap years',()=>{
 assert.equal(requestedCalendarInterval('How many days between February 28 and March 1?',2024).days,2);
 assert.equal(requestedCalendarInterval('How many days between February 28 and March 1?',2025).days,1);
 assert.equal(requestedCalendarInterval('How many days between February 30 and March 1?',2025),null);
 assert.equal(requestedCalendarInterval('How many days between June 20 and June 15?',2026),null);
 assert.equal(requestedCalendarInterval('How many days did Pip vomit between June 15 and June 20?',2026),null);
 assert.equal(requestedCalendarInterval('How many days between June 15 and June 20?',NaN),null);
});
