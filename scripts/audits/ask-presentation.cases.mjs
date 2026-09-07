import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';

const pet={...pets[0],id:'nori',name:'Nori'};
const rows=[
 care('one','nori','2026-07-01','general','Nori woke during sleep. She ate her usual food.'),
 care('two','nori','2026-08-01','general','Nori settled during sleep. She finished her food.'),
];
const sentences=[
 {text:'In July, Nori woke during sleep.',sourceIds:['care:one']},
 {text:'She ate her usual food.',sourceIds:['care:one']},
 {text:'In August, Nori settled during sleep.',sourceIds:['care:two']},
 {text:'She finished her food.',sourceIds:['care:two']},
];
const browserSamples=[];
const plan={operation:'overview',readOperation:'overview',selection:'summary',subject:'explicit',petNames:['Nori'],topic:'sleep and food',terms:['sleep','food'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
async function answer(question, extra={}) {
 const result=await exercise(question,{fixturePets:[pet],petId:'nori',history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:{sentences}},reviewResponse:{approved:true,retainedSentenceIndexes:[0,1,2,3]},expectedReviewCalls:1,...extra});
 if(process.env.FURVISE_PRESENTATION_EXPORT==='1') {
  browserSamples.push({question,answer:result.result.reasoning.answer,sourceIds:result.result.reasoning.evidenceContract.answerSourceIds||[]});
  writeFileSync('tests/fixtures/ask-presentation-snapshots.js','// Generated from production callback with synthetic providers/DB.\nconst samples = '+JSON.stringify(browserSamples,null,2)+';\nexport default samples;\n');
 }
 return result;
}
test('explicit two-point presentation survives the production callback without losing supported facts',async t=>{
 clock(t);
 const r=await answer('Summarize Nori sleep and food history in two bullet points.');
 const text=r.result.reasoning.answer.summary;
 assert.equal((text.match(/^- /gm)||[]).length,2,text);
 for(const sentence of sentences) assert.ok(text.includes(sentence.text),text);
 assert.deepEqual(r.result.reasoning.evidenceContract.answerSourceIds,['care:one','care:two']);
 assert.deepEqual(r.result.acceptedCareActions,[]);
 assert.deepEqual(r.result.acceptedLearnings,[]);
});
test('numbered presentation is layout, not an invented episode count',async t=>{
 clock(t);
 const r=await answer('Summarize Nori sleep and food records as a numbered list.');
 const text=r.result.reasoning.answer.summary;
 assert.match(text,/^1\. /);
 assert.doesNotMatch(text,/four episodes|4 episodes|first episode/i);
 assert.deepEqual(r.result.acceptedSemanticEvents,[]);
});
test('paragraph request wins over model-authored bullet decoration',async t=>{
 clock(t);
 const proposed={sentences:sentences.map(s=>({...s,text:'- '+s.text}))};
 const r=await answer('Summarize Nori sleep and food records in one paragraph, no bullets.',{providerOverrides:{historyNarrative:proposed}});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/^- /m);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/\. - /);
});

test('layout changes preserve every retained token and cannot restore sanitation removals',async t=>{
 clock(t);
 const {presentReviewedHistory,preserveReviewedLayout,requestedHistoryLayout,stripHistoryBullet}=await import('../../app/lib/intelligence/history-presentation.ts');
 assert.equal(stripHistoryBullet('- 2.5 degrees was recorded.'),'- 2.5 degrees was recorded.');
 const facts=['Weight was 27.8 kg, not 28.4 kg.','The dose was 2.5 mg on Aug. 19.','A cause was uncertain.'];
 for (const request of ['Use two bullet points.','Use eight bullets.','Use a numbered list.','Use one paragraph.']) {
  const shown=presentReviewedHistory(facts,request);
  for (const fact of facts) assert.equal(shown.split(fact).length-1,1,shown);
 }
 const reviewed='First supported sentence.\n\nI saved this. Second supported sentence.';
 const safe='First supported sentence. Second supported sentence.';
 assert.equal(preserveReviewedLayout(reviewed,safe),safe);
 assert.equal(preserveReviewedLayout('No symptoms.\n\nUncertain cause.','Symptoms. Uncertain cause.'),'Symptoms. Uncertain cause.');
 for (const request of ['Were there two episodes?','What do the blood bullet cells mean?','The note says "use two bullet points". What happened?']) {
  assert.equal(requestedHistoryLayout(request),null,request);
 }
 assert.equal(requestedHistoryLayout('Use bullet points, actually one paragraph.').style,'paragraph');
 assert.equal(requestedHistoryLayout('One paragraph, actually use bullets.').style,'bullets');
});

test('partial rejection cannot reappear in layout or cause invented extra points',async t=>{
 clock(t);
 const r=await answer('Summarize Nori history in eight bullet points.',{
  providerOverrides:{historyNarrative:{sentences:[sentences[0],{text:'Nori will never be sick again.',sourceIds:['care:one']},sentences[2]]}},
  reviewResponse:{approved:true,retainedSentenceIndexes:[0,2]},
 });
 const text=r.result.reasoning.answer.summary;
 assert.equal((text.match(/^- /gm)||[]).length,2,text);
 assert.doesNotMatch(text,/never be sick/);
 assert.deepEqual(r.result.acceptedCareActions,[]);
});

test('long reviewed prose gains paragraph boundaries without fabricated headings',async t=>{
 clock(t);
 const {presentReviewedHistory}=await import('../../app/lib/intelligence/history-presentation.ts');
 const facts=Array.from({length:8},(_,i)=>'The owner report '+i+' describes an uncertain change after a different routine, without establishing a cause or confirming a diagnosis.');
 const text=presentReviewedHistory(facts,'Summarize the records.');
 assert.ok(text.includes('\n\n'));
 assert.equal(text.replace(/\s+/g,' '),facts.join(' '));
});

test('provider-approved false persistence remains removed by downstream sanitation',async t=>{
 clock(t);
 const r=await answer('Summarize Nori history in two bullet points.',{
  providerOverrides:{historyNarrative:{sentences:[sentences[0],{text:'I saved the sleep history.',sourceIds:['care:one']},sentences[2]]}},
  reviewResponse:{approved:true,retainedSentenceIndexes:[0,1,2]},
 });
 assert.doesNotMatch(r.result.reasoning.answer.summary,/I saved/);
 assert.deepEqual(r.result.acceptedCareActions,[]);
});

test('serialization and reload preserve ordinary and historical list layouts without inventing prose',async t=>{
 clock(t);
 const {buildAskConversationResponse,parseAskConversationResponse}=await import('../../app/lib/ask.mjs');
 for(const summary of [
  '- Weight was 27.8 kg.\n- Cause remains uncertain.\n\nOnly these notes were checked.',
  '1. The dose was 2.5 mg.\n2. The note is dated Aug. 19.',
  '- 2.5 degrees was the recorded temperature.',
  'I am here to listen.\n\nWhat feels hardest?',
 ]) {
  const response={title:'Furvise',summary,sections:[],safetyNote:null};
  const stored=buildAskConversationResponse(response);
  const reloaded=parseAskConversationResponse(JSON.parse(JSON.stringify(stored)));
  assert.equal(reloaded.directAnswer,summary);
  assert.doesNotMatch(reloaded.directAnswer,/Useful next steps/);
 }
 const removed=buildAskConversationResponse({title:'Furvise',summary:'- Review the action below.\n- A cause remains uncertain.',sections:[],safetyNote:null});
 assert.doesNotMatch(removed.directAnswer,/action below/);
 assert.match(removed.directAnswer,/cause remains uncertain/i);
});

test('table facts survive conversation serialization and reload', async () => {
 const {buildAskConversationResponse,parseAskConversationResponse}=await import('../../app/lib/ask.mjs');
 const summary='| Date | Weight |\n| --- | --- |\n| 2025-03-02 | 11.4 kg |\n\nOnly these records were checked.';
 const stored=buildAskConversationResponse({title:'Furvise',summary,sections:[],safetyNote:null});
 assert.equal(parseAskConversationResponse(JSON.parse(JSON.stringify(stored))).directAnswer,summary);
 const {parsePlainTable}=await import('../../app/lib/plain-table.ts');
 assert.deepEqual(parsePlainTable(summary.split('\n\n')[0]),{headers:['Date','Weight'],rows:[['2025-03-02','11.4 kg']]});
 for(const invalid of ['| Date | Weight |\n| --- | --- |','| A | B |\n| --- | --- |\n| x |','not a table']) assert.equal(parsePlainTable(invalid),null);
});
