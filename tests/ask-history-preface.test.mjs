import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeOwnerAssertions} from '../app/lib/ai/owner-assertion.ts';

test('historical prefaces remain questions across coordinated clauses',()=>{
 for(const q of ["In Pip's June notes, what changed and what stayed the same when the treats stopped?",'From the care records, what improved and what returned?']) {
 const a=analyzeOwnerAssertions(q);assert.equal(a.hasOwnerAssertion,false);assert.equal(a.isPureQuestion,true);
 }
});
test('a historical question does not suppress an independent new observation',()=>{
 const a=analyzeOwnerAssertions("In Pip's June notes, what changed? He vomited today.");
 assert.equal(a.hasOwnerAssertion,true);assert.match(a.assertionText,/vomited today/);
});
