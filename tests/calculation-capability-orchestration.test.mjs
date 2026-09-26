import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
 if(url.endsWith('/app/lib/intelligence/run-intelligence.ts'))return {format:'module',shortCircuit:true,source:'export async function runFurviseIntelligence(){throw Error("ANSWER_GENERATION_REACHED");}'};
 return next(url,context);
}});
const {test,assert,fixture,calculation,slot}=await import('./helpers/calculation-public-fixture.mjs');
const {generateAskHistoryAnswer}=await import('../app/lib/intelligence/generate-ask-history.ts');

test('supported saved-history calculation must traverse history before publication',async()=>{
 const f=await fixture({calculations:[calculation('difference',[slot(1),slot(0)])]});
 f.context.selectedCareEntries=[]; const stages=[];
 const db=new Proxy({}, {get(){throw Error('HISTORY_DATABASE_REACHED');}});
 await assert.rejects(generateAskHistoryAnswer({
   context:f.context,
   supabase:db,
   requestId:'capability-test',
   authoritativePetIds:f.subjects.map(p=>p.id),
   onStage:s=>stages.push(s)
 }),/HISTORY_DATABASE_REACHED/);
 assert.ok(stages.includes('history_retrieval'));
 assert.ok(!stages.includes('answer_generation'));
});
