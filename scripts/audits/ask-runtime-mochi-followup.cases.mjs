import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId } from './fixtures/ask-lifetime-history.mjs';

const mochi = { id:'mochi', user_id:ownerId, name:'Mochi', species:'cat', sex:'female', lifecycle_status:'active',
  weight_value:null, weight_unit:'kg', current_food:'rabbit complete adult wet food', avoid_ingredients:[],
  created_at:'2024-01-01T00:00:00Z', updated_at:'2026-09-09T12:00:00Z' };
const rows = [
  care('mochi-weight-jun','mochi','2026-06-09','general','Mochi weighed 3.87 kg on 2026-06-09. This was body mass on the household scale with no carrier or harness included.'),
  care('mochi-parcel-jul','mochi','2026-07-24','general','Mochi: a sealed 1.2 kg food parcel arrived; parcel weight is not pet weight.'),
  care('mochi-food-aug','mochi','2026-08-12','food','Mochi ate 83 g of rabbit complete adult wet food.'),
  care('mochi-weight-sep','mochi','2026-09-09','general','Mochi body weight was 3.8 kg on September 9, 2026 without equipment.'),
];
const messages = [
  { id:'q-old', role:'user', user_text:"What was Mochi's weight on June 9, 2026?", sequence_number:1 },
  { id:'a-old', role:'furvise', response_data:{ directAnswer:'Mochi weighed 3.87 kg on June 9, 2026.' }, sequence_number:2 },
].map(row=>({...row,user_id:ownerId,conversation_id:'chat',created_at:'2026-09-17T12:32:00Z'}));

test('runtime Mochi two-date follow-up keeps only the requested weight evidence', async t => {
  clock(t);
  const q='How does that compare with her September 9 weight?';
  const text='Mochi weighed 3.87 kg on June 9, 2026 and 3.8 kg on September 9, 2026.';
  const run=await exercise(q,{
    history:true, fixturePets:[mochi], rows, petId:'mochi', conversationPetId:'mochi', messages, authoritativePetIds:['mochi'],
    expectedReviewCalls:1, reviewResponse:{approved:true},
    providerOverrides:{ answer:text, historyNarrative:{sentences:[{text,sourceIds:['care:mochi-weight-jun','care:mochi-weight-sep'],calculations:[]}]}, relevantContextIds:['care:mochi-weight-jun','care:mochi-weight-sep'] },
    interpretationProposal:{version:'ask-request.v2',task:null,temporalScope:'historical',mutationIntent:null,recordSelection:null,profileFields:[],projection:null,
      mode:'read',question:q,requirements:[],evidenceNeeds:[
        {sourceTurnId:'q-old',quote:"What was Mochi's weight on June 9, 2026?",terms:['weight'],petNames:['Mochi'],order:'context'},
        {sourceTurnId:null,quote:'September 9 weight',terms:['weight'],petNames:['Mochi'],order:'context'}],
      outputFormat:'prose',evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:['q-old'],scope:'named',petNames:['Mochi'],
      operation:'comparison',selection:'comparison',quantity:'measurement',topic:'weight',terms:['weight','weigh'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null}
  });
  const careIds=run.prompt.contextRecords.filter(r=>r.sourceType==='care_update').map(r=>r.id);
  assert.ok(careIds.includes('care:mochi-weight-jun'));
  assert.ok(careIds.includes('care:mochi-weight-sep'));
  assert.equal(careIds.includes('care:mochi-parcel-jul'),false);
  assert.equal(careIds.includes('care:mochi-food-aug'),false);
  assert.equal(run.publication.failure,null);
});
