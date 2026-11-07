import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeLabsList,labsListSourceIds} from '../app/lib/intelligence/labs-list.ts';
const labs=()=>({
 ticket:{authority:'stored_report',operation:'read',subjects:{petIds:['p']},temporal:{from:null,to:null,anchor:null,calendar:null},
  outputs:{completeness:'sufficient',ordering:'asc',limit:null},predicates:[]},
 coverage:{status:'partial',reasons:['no_cross_query_snapshot'],sourceLineage:[]},
 records:[{id:'r',sourceId:'care:r',petId:'p',event_at:'2025-02-01T12:00:00Z',
  recorded_at:'2025-02-01T12:00:00Z',body:'An exact quote — with punctuation.',predicates_matched:[]}],
 petNames:{p:'Pet'},quantityUnspecified:true,calculations:[],presentation:'prose',
});
test('partial saved-report answer keeps exact source wording and one selection limitation',()=>{
 const text=serializeLabsList(labs());
 assert.ok(text.includes('An exact quote — with punctuation.'));
 assert.match(text,/couldn't confirm all matching notes/);
 assert.doesNotMatch(text,/These results may not fully answer your question/);
 assert.doesNotMatch(text,/care:r/);
 assert.deepEqual(labsListSourceIds(labs()),['care:r']);
});
test('complete saved-report answer retains the independent quantity limitation',()=>{
 const data=labs();data.coverage.status='complete';
 const text=serializeLabsList(data);
 assert.match(text,/These results may not fully answer your question/);
});
