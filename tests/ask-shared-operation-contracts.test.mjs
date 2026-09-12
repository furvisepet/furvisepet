import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryCalculations, verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';
import { canonicalReadPresentation, readPublicationFailure } from '../app/lib/ask-publication.ts';
import { receiptCompletionText } from '../app/lib/intelligence/receipt-completion.ts';
import { readRecordInventory } from '../app/lib/intelligence/record-inventory.ts';
import { validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';
import { emptyProposedSemanticFrame } from '../app/lib/intelligence/semantic-frame/extract-frame.ts';
import { historyNarrativeAnchorsSupported } from '../app/lib/intelligence/history-narrative-facts.ts';
import { isExplicitNoPersistenceRequest } from '../app/lib/intelligence/care-history-policy.ts';
import { orchestrateAskTurn } from '../app/lib/ai/ask-orchestrator.ts';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

test('temporal evidence endpoints are independent of comparison vocabulary',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Does Fern’s April 2024 recovery report tell us whether she is well today?';
 const proposal={version:'ask-request.v2',mode:'read',temporalScope:'historical_and_current',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'recall',selection:'period',quantity:null,topic:'recovery',terms:['recovery'],from:'2024-04-01',to:'2024-05-01',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
 const context={owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]};
 const result=validateAskRequest(proposal,context);
 assert.equal(result.history.from,null); assert.equal(result.history.to,null);
 assert.equal(result.selection,'comparison');
 assert.deepEqual(result.request.profileFields,[]);
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
test('a percentage share of a combined total has a first-class verified operation', () => {
  const sources=[{sourceId:'care:active',text:'Active play lasted 29 minutes.'},{sourceId:'care:rest',text:'Rest lasted 3 minutes.'}];
  const calculation={operation:'percent_of_sum',expression:null,operands:[
    {sourceId:'care:rest',field:'text',literal:'3 minutes'},
    {sourceId:'care:active',field:'text',literal:'29 minutes'}],value:9.4,unit:'%'};
  assert.ok(parseHistoryCalculations([calculation]));
  assert.deepEqual(verifiedCalculationQuantities([calculation],sources),['9.4:%']);
  assert.equal(verifiedCalculationQuantities([{...calculation,value:90.6}],sources),null);
});
test('past-to-present weight comparisons require the current profile endpoint',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Compare Fern’s April 9, 2024 weight with her current recorded weight and give the change.';
 const proposal={version:'ask-request.v2',mode:'read',temporalScope:'historical_and_current',profileFields:[],question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'comparison',selection:'comparison',quantity:'measurement',topic:'weight',terms:['weight'],from:'2024-04-09',to:'2024-04-10',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
 const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
 assert.deepEqual(result.request.profileFields,['weight']);
 assert.equal(result.history.from,null); assert.equal(result.history.to,null);
});
test('past-to-present weight projection uses profile authority, not a later care observation',()=>{
 const requestText="Compare Fern's April 9, 2024 weight with her current recorded weight and give the absolute and percent change.";
 const profileText='3.8 kg',oldText='Fern body weight was 3.97 kg on 2024-04-09.',newerText='Fern body weight was 3.92 kg on 2026-08-09.';
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:['pet'],requestedTopic:'weight',requestText,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
  sources:[{petId:'pet',source:'profile',status:'loaded',loadedIds:['pet'],loadedCount:1,cap:null,reasons:[],completeness:{}},
   {petId:'pet',source:'care_entries',status:'loaded',loadedIds:['care:old','care:newer'],loadedCount:2,cap:null,reasons:[],completeness:{}}],
  completeness:{},losses:[],representation:'complete',verifiedFacts:[],petNames:{pet:'Fern'},
  interpretation:{request:{profileFields:['weight'],temporalScope:'historical_and_current',outputFormat:null,referenceTurnIds:[]}},
  history:{corrections:'complete',provenance:[{sourceId:'care:old',status:'effective_linked'},{sourceId:'care:newer',status:'effective_linked'}]},
  represented:[
   {sourceId:'profile:pet:weight',petId:'pet',sourceType:'profile',field:'value',start:0,end:profileText.length,text:profileText},
   {sourceId:'care:old',petId:'pet',sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2024-04-09T12:00:00Z'},
   {sourceId:'care:newer',petId:'pet',sourceType:'care_update',field:'value',start:0,end:newerText.length,text:newerText,occurredAt:'2026-08-09T12:00:00Z'}]};
 const projection=deterministicReadProjection(evidence);
 assert.match(projection.sentences[0].text,/3\.97 kg.*current profile value of 3\.8 kg.*decrease of 0\.17 kg \(4\.3%\)/);
 assert.deepEqual(projection.sentences[0].sourceIds,['care:old','profile:pet:weight']);
 assert.deepEqual(projection.sentences[0].calculations.map(item=>item.value),[-0.17,-4.3]);
});
test('equivalent displayed units inherit verified measurement and calculation provenance', () => {
  const source={text:'Pixel weighed 4.94 kg on 2022-10-09.',occurredAt:'2022-10-09T12:00:00Z',petId:'pet'};
  const request='Return the saved weight in kilograms, grams, and pounds rounded to one decimal.';
  assert.equal(historyNarrativeAnchorsSupported('Pixel weighed 4.94 kg, or 4,940 g and 10.9 lb.',[source],request,[],false),true);
  assert.equal(historyNarrativeAnchorsSupported('Pixel weighed 4.94 kg, or 4,940 g and 11.9 lb.',[source],request,[],false),false);
  assert.equal(historyNarrativeAnchorsSupported('The difference is 10 g.',[], '', ['0.01:kg'],false),true);
  assert.equal(historyNarrativeAnchorsSupported('The difference is 11 g.',[], '', ['0.01:kg'],false),false);
});
test('explicit no-write wording suppresses suggestions independently of model intent', async () => {
  for (const message of ['Show the correction. Save nothing.','Resume la nota. No guardes nada.','Résume la note. Ne sauvegarde rien.']) {
    assert.equal(isExplicitNoPersistenceRequest(message),true);
    const result=await orchestrateAskTurn({concerns:[],message,petName:'Fern',generate:async()=>({
      answer:{title:'Furvise',summary:'Read-only answer.',sections:[],safetyNote:null},safetyLevel:'normal',responseMode:'normal',applicationActions:[],
      proposedHistoryUpdate:{shouldOffer:true,resolvesConcernId:null,title:'Update',details:'Fern weighs 2 kg.',category:'general',severity:'mild'},
      evidenceContract:{scope:{readOnlyRecall:false},interpretation:{conversationOnly:false}},
    })});
    assert.equal(result.suggestion,null);
  }
});
test('receipt follow-ups recover owned read scope from the latest user action request', () => {
  const pet={id:'pet',user_id:'owner',name:'Fern'};
  const currentMessage='Check the linked receipts for that two-note save. State how many notes were saved and quote both. Do not save them again.';
  const result=validateAskRequest({version:'ask-request.v2',mode:'read',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'none',petNames:[],operation:'recall',selection:'reference',quantity:'records',topic:'receipts',terms:['receipts'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'}, {
    owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[{id:'save-turn',role:'user',text:'Save two separate notes for Fern: January 2: walked. January 4: played.'}],
  });
  assert.equal(result.readOnly,true); assert.deepEqual(result.petIds,['pet']);
  assert.deepEqual(result.request.referenceTurnIds,['save-turn']); assert.equal(result.request.question,currentMessage);
});
test('publishable presentation is compiled before review and removes mutation claims before approval', () => {
  const text=canonicalReadPresentation('The recorded total is **140 g**.');
  assert.equal(text,'The recorded total is 140 g.');
  assert.equal(readPublicationFailure(text),null);
  assert.equal(canonicalReadPresentation(text),text);
  assert.notEqual(readPublicationFailure('I updated the profile.'),null);
  assert.equal(canonicalReadPresentation('I updated the profile.'),'I can help with that.');
  assert.equal(readPublicationFailure(canonicalReadPresentation('I updated the profile.')),null);
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
