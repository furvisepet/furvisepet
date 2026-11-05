import * as C from './helpers/calculation-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {clock,exercise} from '../scripts/audits/helpers/lifetime-harness.mjs';
import {pets as templates,ownerId} from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
import {stressProposal} from '../scripts/audits/helpers/current-stress-harness.mjs';

const pet={...templates[0],id:'scoped-pet',name:'Quartz',user_id:ownerId};
const q="What did Quartz's January 1 2024 note say about routine?";
const row={...C.row('source','The usual routine included a walk.'),user_id:ownerId,pet_profile_id:pet.id};
const proposal=stressProposal({authority:'stored_report',selection:'summary',petNames:[pet.name],from:'2024-01-01',to:'2024-01-02',terms:['routine']});
proposal.quantity=null;proposal.readTicket.outputs.completeness='sufficient';
async function run(t, graph, turnId = 'current-turn') {
 clock(t);
 return exercise(q,{fixturePets:[pet],petId:pet.id,conversationPetId:pet.id,rows:[row],messages:[],
 history:true,interpretationProposal:{...proposal,question:q},expectedProviderCalls:0,expectedReviewCalls:0,
 graph:{sourceSemanticsPage:{complete:false,limit:76,claims:[],sources:[]},...graph},
 prepareContext:ctx=>{ctx.currentTurn={id:turnId,role:'user',text:q,createdAt:'2024-01-04T00:00:00Z'};}
 });
}
test('partial report source is quoted with a citation under incomplete semantics',async t=>{
 const r=await run(t,{});assert.equal(r.result.reasoning.model,'server-labs-list');
 assert.match(r.result.reasoning.answer.summary,/The usual routine included a walk/);
 assert.deepEqual(r.result.reasoning.relevantContextIds,['care:source']);
 assert.ok(r.result.reasoning.referencedRecords.some(record=>record.id==='care:source'));
 assert.ok(r.result.reasoning.labsList.records.some(record=>record.sourceId==='care:source' && record.body===row.note));
 assert.equal(r.context.askHistory.coverage.ticketCoverage.status,'partial');
 assert.equal(r.context.askHistory.coverage.ticketCoverage.resultSet.certified,false);
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
});
for(const [name,graph] of [['withheld',{withheld_source_ids:['source']}],['changed',{sources:[{...row,note:'A changed version.'}]}]])
 test(name+' source is not quoted',async t=>{const r=await run(t,graph);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);assert.doesNotMatch(r.result.reasoning.answer.summary,/usual routine/);});

test('a different current turn cannot consume the source proof',async t=>{
 const r=await run(t,{},'different-turn');assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/usual routine/);
});
