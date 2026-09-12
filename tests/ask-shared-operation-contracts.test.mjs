import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryCalculations, verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';
import { canonicalReadPresentation, readPublicationFailure } from '../app/lib/ask-publication.ts';
import { receiptCompletionText } from '../app/lib/intelligence/receipt-completion.ts';
import { readRecordInventory } from '../app/lib/intelligence/record-inventory.ts';
import { validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';
import { emptyProposedSemanticFrame } from '../app/lib/intelligence/semantic-frame/extract-frame.ts';

test('temporal evidence endpoints are independent of comparison vocabulary',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Does Fern’s April 2024 recovery report tell us whether she is well today?';
 const proposal={version:'ask-request.v2',mode:'read',temporalScope:'historical_and_current',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'recall',selection:'period',quantity:null,topic:'recovery',terms:['recovery'],from:'2024-04-01',to:'2024-05-01',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
 const context={owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]};
 const result=validateAskRequest(proposal,context);
 assert.equal(result.history.from,null); assert.equal(result.history.to,null);
 assert.equal(result.selection,'comparison');
 assert.deepEqual(result.petIds,['pet']); assert.equal(result.readOnly,true);
 const historical=validateAskRequest({...proposal,temporalScope:'historical'}, {...context,currentMessage:'Show Fern’s April 2024 recovery report.'});
 assert.equal(historical.history.from,'2024-04-01T00:00:00.000Z');
 assert.equal(historical.history.to,'2024-05-01T00:00:00.000Z');
 assert.throws(()=>validateAskRequest({...proposal,temporalScope:'invented'},context),/temporal_scope/);
});

test('a fallback year never expands an interpreted local-language date interval',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 for(const [currentMessage,from,to] of [
  ['Resume las observaciones de Fern del 10 y del 13 de agosto de 2023.','2023-08-10','2023-08-14'],
  ['Résume les observations de Fern du 4 au 8 février 2025.','2025-02-04','2025-02-09']]) {
  const result=validateAskRequest({version:'ask-request.v2',mode:'read',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'recall',selection:'period',quantity:null,topic:'observations',terms:[],from,to,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'},
   {owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
  assert.equal(result.history.from,from+'T00:00:00.000Z');
  assert.equal(result.history.to,to+'T00:00:00.000Z');
 }
});

test('an irrelevant read-planning hint cannot terminate an owned episode question', () => {
  const pet={id:'pet',user_id:'owner',name:'Fern'};
  const currentMessage='How many vomiting episodes are recorded for Fern in 2024?';
  const context={owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]};
  const proposal={version:'ask-request.v2',mode:'read',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'count',selection:'period',quantity:'episodes',topic:'vomiting',terms:['vomiting'],from:'2024-01-01',to:'2025-01-01',episodeTopic:'vomiting',ordinal:null,frame:null,evidenceBasis:'saved_history',recordSelection:{scope:'all_active',quote:'invented hint'}};
  const result=validateAskRequest(proposal,context);
  assert.equal(result.request.recordSelection,null);
  assert.equal(result.request.quantity,'episodes');
  assert.deepEqual(result.petIds,['pet']);
  assert.throws(()=>validateAskRequest({...proposal,petNames:['Another owner pet']},context),/ownership/);
});

test('a record correction retrieves its original interval without becoming a read-only task', () => {
  const pet={id:'pet',user_id:'owner',name:'Fern'};
  const currentMessage='Correct Fern’s January 4, 2026 walking note from 18 minutes to 19 minutes.';
  const result=validateAskRequest({version:'ask-request.v2',mode:'mixed',mutationIntent:'correct_record',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'recall',selection:'period',quantity:null,topic:'walking',terms:['walk'],from:'2026-01-04',to:'2026-01-05',episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:'saved_history'}, {owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
  assert.equal(result.readOnly,false);
  assert.equal(result.request.mutationIntent,'correct_record');
  assert.equal(result.history.from,'2026-01-04T00:00:00.000Z');
});

test('aggregations operate over original measurements, with unit conversion and no invented divisor', () => {
  const sources = [10,20,30,40,50,60].map((v,i)=>({sourceId:`care:${i}`,text:`Measured ${v} g.`}));
  const mean = { operation:'mean', expression:null, operands:sources.map(s=>({sourceId:s.sourceId,field:'text',literal:s.text.slice(9,-1)})),value:0.035,unit:'kg' };
  assert.ok(parseHistoryCalculations([mean]));
  assert.deepEqual(verifiedCalculationQuantities([mean],sources),['0.035:kg']);
  assert.equal(verifiedCalculationQuantities([{...mean,value:0.036}],sources),null);
  assert.equal(verifiedCalculationQuantities([mean],sources.slice(1)),null);
  assert.equal(verifiedCalculationQuantities([{...mean,unit:'ml'}],sources),null);
});
test('presentation is compiled before review without disabling mutation-claim rejection', () => {
  const text=canonicalReadPresentation('The recorded total is **140 g**.');
  assert.equal(text,'The recorded total is 140 g.');
  assert.equal(readPublicationFailure(text),null);
  assert.equal(canonicalReadPresentation(text),text);
  assert.notEqual(readPublicationFailure(canonicalReadPresentation('I updated the profile.')),null);
  const json='{"note":"literal **text** and 2.50 g"}';
  assert.equal(canonicalReadPresentation(json),json);
});
test('receipt completion requires every exact requested record and never trusts an assistant answer', () => {
  const requestText='Save two separate notes: January 2, 2026: walked 12 minutes. January 4, 2026: walked 18 minutes.';
  const records=[{id:'one',note:'January 2, 2026: walked 12 minutes.',occurredAt:'2026-01-02T00:00:00Z'}, {id:'two',note:'January 4, 2026: walked 18 minutes.',occurredAt:'2026-01-04T00:00:00Z'}];
  const receipt={sourceMessageId:'turn',petId:'pet',requestText,answerPersisted:true,records};
  assert.match(receiptCompletionText(receipt),/^All 2 requested notes/);
  assert.match(receiptCompletionText({...receipt,records:records.slice(1)}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[records[0],records[0]]}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[records[0],{...records[1],note:'Changed content'}]}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[]}),/^0 of 2/);
});
test('typed inventory selection survives wording variation but rejects content-filtered totals', async () => {
  const message='As of this lookup, enumerate the number of active entries in the specified date interval.';
  const context={owner:{userId:'owner'},eligiblePets:[{id:'pet',user_id:'owner'}],currentMessage:message,
    askInterpretation:{readOnly:true,petIds:['pet'],request:{quantity:'records',recordSelection:{scope:'all_active',quote:message}},history:{from:'2025-02-01T00:00:00Z',to:'2025-03-01T00:00:00Z',terms:['entries']}}};
  const calls=[];const db={};for(const method of ['from','select','eq','is','gte','lt'])db[method]=(...args)=>{calls.push([method,...args]);return db;};db.abortSignal=async()=>({count:9,error:null});
  assert.equal((await readRecordInventory(context,db))[0].count,9);
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner'));
  context.askInterpretation.request.recordSelection.scope='content_filtered';
  assert.deepEqual(await readRecordInventory(context,{from(){throw Error('unsafe unfiltered count');}}),[]);
});
test('edit receipts establish execution separately from inserted note rows',async()=>{
  const {operationReceiptEvidence}=await import('../app/lib/intelligence/ask-evidence.ts');
  const receipt={sourceMessageId:'turn',petId:'pet',requestText:'Correct the saved record.',answerPersisted:true,records:[],
    actionReceipts:[{id:'cap',kind:'care_history.edit',status:'succeeded',resultMessage:'History update changed.'}]};
  const sources=operationReceiptEvidence([receipt]);
  assert.equal(sources.length,2);assert.match(sources[1].text,/requested action completed/);
  assert.match(sources[1].text,/does not certify.*unchanged/);
  for(const status of ['failed','cancelled','confirmation_required']){
    const source=operationReceiptEvidence([{...receipt,actionReceipts:[{...receipt.actionReceipts[0],status}]}])[1];
    assert.doesNotMatch(source.text,/requested action completed/);assert.match(source.text,/not successful writes/);
  }
});
test('calculated answers inherit all operand sources without granting unknown operands authority',async()=>{
  const {parseHistoryNarrative}=await import('../app/lib/intelligence/history-narrative.ts');
  const {verifiedCalculationQuantities}=await import('../app/lib/intelligence/history-calculation.ts');
  const calculation={operation:'elapsed_days',operands:[
    {sourceId:'care:start',field:'occurredAt',literal:'2024-03-02T00:00:00Z'},
    {sourceId:'care:stop',field:'occurredAt',literal:'2024-03-05T00:00:00Z'}],value:3,unit:'days'};
  const draft=parseHistoryNarrative({sentences:[{text:'The calendar-day gap is 3 days.',sourceIds:['episode-result:pet'],calculations:[calculation]}]});
  assert.deepEqual(draft.sentences[0].sourceIds,['episode-result:pet','care:start','care:stop']);
  const sources=[{sourceId:'episode-result:pet',text:'One recorded episode.'},
    {sourceId:'care:start',text:'Started.',occurredAt:'2024-03-02T00:00:00Z'},
    {sourceId:'care:stop',text:'Stopped.',occurredAt:'2024-03-05T00:00:00Z'}];
  assert.ok(verifiedCalculationQuantities(draft.sentences[0].calculations,sources));
  assert.equal(verifiedCalculationQuantities([{...calculation,operands:[calculation.operands[0],{...calculation.operands[1],sourceId:'foreign'}]}],sources),null);
});


test('receipt evidence follows validated references and persisted request identity only', async()=>{
 const {createAskEvidenceContract}=await import('../app/lib/intelligence/ask-evidence.ts');
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const receipt=(sourceMessageId,petId='pet')=>({sourceMessageId,petId,requestText:'Save a note',answerPersisted:true,records:[]});
 const turns=[{id:'old',role:'user',requestId:'old-request',operationReceipt:receipt('old')},
  {id:'save',role:'user',requestId:'save-request',operationReceipt:receipt('save')},
  {id:'answer',role:'furvise',requestId:'save-request'},
  {id:'adjacent',role:'user',operationReceipt:receipt('adjacent')},
  {id:'foreign',role:'user',requestId:'foreign-request',operationReceipt:receipt('foreign','other')},
  {id:'current',role:'user',requestId:'current-request',operationReceipt:receipt('current')}];
 const build=(referenceTurnIds)=>createAskEvidenceContract({owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:'Read saved history',careEntries:[],selectedCareEntries:[],conversationTurns:turns,
  askInterpretation:{request:{referenceTurnIds},operation:'recall',readOnly:true,history:null}},['pet']);
 assert.deepEqual(build([]).operationReceipts,[]);
 assert.equal(build([]).sources.some(source=>source.source==='operation_receipts'),false);
 for(const refs of [['save'],['answer'],['save','answer']]) assert.deepEqual(build(refs).operationReceipts.map(r=>r.sourceMessageId),['save']);
 for(const refs of [['missing'],['foreign'],['current']]) assert.deepEqual(build(refs).operationReceipts,[]);
 assert.deepEqual(build(['adjacent']).operationReceipts.map(r=>r.sourceMessageId),['adjacent']);
 assert.equal(turns[0].operationReceipt.sourceMessageId,'old');
});
