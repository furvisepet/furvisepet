import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
 if(url.endsWith('/app/lib/intelligence/run-intelligence.ts'))return {format:'module',shortCircuit:true,source:'export async function runFurviseIntelligence(){throw Error("REACHED_PUBLICATION_WITHOUT_HISTORY");}'};
 return next(url,context);
}});
const {test,assert,fixture,calculation,slot}=await import('./helpers/calculation-public-fixture.mjs');
const {generateAskHistoryAnswer}=await import('../app/lib/intelligence/generate-ask-history.ts');
test('bound unsupported calculation reaches publication without history database traversal',async()=>{
 const f=await fixture({calculations:[calculation('difference',[slot(1),slot(0)])]});
 f.context.selectedCareEntries=[]; const stages=[];
 const db=new Proxy({}, {get(){throw Error('DATABASE_ACCESS_FOR_UNSUPPORTED_CALCULATION');}});
 await assert.rejects(generateAskHistoryAnswer({context:f.context,supabase:db,requestId:'capability-test',authoritativePetIds:f.subjects.map(p=>p.id),onStage:s=>stages.push(s)}),/REACHED_PUBLICATION_WITHOUT_HISTORY/);
 assert.ok(stages.includes('answer_generation'));assert.ok(!stages.includes('history_retrieval'));
});
