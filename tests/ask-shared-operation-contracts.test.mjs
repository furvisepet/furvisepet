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
import { enforceVerifiedStateClaims } from '../app/lib/application-actions/state-claims.ts';

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
test('magnitude-only differences do not weaken signed difference validation',()=>{
 const sources=[{sourceId:'care:high',text:'Active play lasted 29 minutes.'},{sourceId:'care:low',text:'Active play lasted 15 minutes.'}];
 const operands=[{sourceId:'care:low',field:'text',literal:'15 minutes'},{sourceId:'care:high',field:'text',literal:'29 minutes'}];
 assert.deepEqual(verifiedCalculationQuantities([{operation:'absolute_difference',expression:null,operands,value:14,unit:'minutes'}],sources),['14:minute']);
 assert.equal(verifiedCalculationQuantities([{operation:'difference',expression:null,operands,value:14,unit:'minutes'}],sources),null);
});
test('past-to-present weight comparisons require the current profile endpoint',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Compare Fern’s April 9, 2024 weight with her current recorded weight and give the change.';
 const proposal={version:'ask-request.v2',mode:'read',temporalScope:'historical',profileFields:[],question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'comparison',selection:'comparison',quantity:'measurement',topic:'weight',terms:['weight'],from:'2024-04-09',to:'2024-04-10',episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
 const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
 assert.deepEqual(result.request.profileFields,['weight']);
 assert.equal(result.request.temporalScope,'historical_and_current');
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
 assert.match(projection.sentences[0].text,/Fern went from 3\.97 kg on Apr 9, 2024 to 3\.8 kg now, a decrease of 0\.17 kg \(4\.3%\)/);
 assert.deepEqual(projection.sentences[0].sourceIds,['care:old','profile:pet:weight']);
 assert.deepEqual(projection.sentences[0].calculations.map(item=>item.value),[-0.17,-4.3]);
 const grams=deterministicReadProjection({...evidence,scope:{...evidence.scope,requestText:requestText+' Show the change in grams.'}});
 assert.match(grams.sentences[0].text,/decrease of 170 g/);
 assert.equal(grams.sentences[0].calculations[0].value,-170);
 assert.equal(grams.sentences[0].calculations[0].unit,'g');
 const monthEvidence={...evidence,scope:{...evidence.scope,requestText:requestText.replace('April 9,','April')+' Show the change in grams.'}};
 assert.match(deterministicReadProjection(monthEvidence).sentences[0].text,/Apr 9, 2024.*170 g/);
 const ambiguous={...monthEvidence,represented:[...evidence.represented,{...evidence.represented[1],sourceId:'care:newer',occurredAt:'2024-04-20T12:00:00Z'}]};
 assert.equal(deterministicReadProjection(ambiguous),null);
});
test('weight shortcut declines tasks that also request another current profile field',()=> {
 const requestText='Compare Ziggy\'s September 13, 2022 weight with the current weight, give the change, and name the currently recorded food.';
 const oldText='Ziggy body weight was 8.7 kg on September 13, 2022 without equipment.';
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:['pet'],requestedTopic:'weight',requestText,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
  sources:[{petId:'pet',source:'profile',status:'loaded',loadedIds:['pet'],loadedCount:1,cap:null,reasons:[],completeness:{}},{petId:'pet',source:'care_entries',status:'loaded',loadedIds:['care:old'],loadedCount:1,cap:null,reasons:[],completeness:{}}],
  completeness:{},losses:[],representation:'complete',verifiedFacts:[],petNames:{pet:'Ziggy'},
  interpretation:{request:{mode:'read',profileFields:['weight','current_food'],temporalScope:'historical_and_current',outputFormat:null,referenceTurnIds:[]}},
  history:{corrections:'complete',provenance:[{sourceId:'care:old',status:'effective_linked'}]},
  represented:[
   {sourceId:'profile:pet:weight',petId:'pet',sourceType:'profile',field:'value',start:0,end:6,text:'9.4 kg'},
   {sourceId:'profile:pet:current_food',petId:'pet',sourceType:'profile',field:'value',start:0,end:35,text:'whitefish-and-potato adult dry food'},
   {sourceId:'care:old',petId:'pet',sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2022-09-13T12:00:00Z'}]};
 assert.equal(deterministicReadProjection(evidence),null);
});

test('quoted source text disambiguates same-day body mass and accepts recorded-weight phrasing',()=> {
 const requestText='Compare Maple\'s September 9, 2022 weight from the note marked "elm compass" with her current recorded weight and give the exact kg change.';
 const profileText='12.7 kg';
 const otherText='Maple weighed 13.02 kg on 2022-09-09. This was body mass on the household scale with no carrier or harness included.';
 const markedText='Synthetic runtime QA only: On 2022-09-09, Maple had a recorded body weight of 11.8 kg. Five-year retrieval marker: elm compass. This is test data.';
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:['pet'],requestedTopic:'weight',requestText,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
  sources:[{petId:'pet',source:'profile',status:'loaded',loadedIds:['pet'],loadedCount:1,cap:null,reasons:[],completeness:{}},
   {petId:'pet',source:'care_entries',status:'loaded',loadedIds:['care:other','care:marked'],loadedCount:2,cap:null,reasons:[],completeness:{}}],
  completeness:{},losses:[],representation:'complete',verifiedFacts:[],petNames:{pet:'Maple'},
  interpretation:{request:{mode:'read',profileFields:['weight'],temporalScope:'historical_and_current',outputFormat:null,referenceTurnIds:[]}},
  history:{corrections:'complete',provenance:[{sourceId:'care:other',status:'effective_linked'},{sourceId:'care:marked',status:'effective_linked'}]},
  represented:[
   {sourceId:'profile:pet:weight',petId:'pet',sourceType:'profile',field:'value',start:0,end:profileText.length,text:profileText},
   {sourceId:'care:other',petId:'pet',sourceType:'care_update',field:'value',start:0,end:otherText.length,text:otherText,occurredAt:'2022-09-09T12:00:00Z'},
   {sourceId:'care:marked',petId:'pet',sourceType:'care_update',field:'value',start:0,end:markedText.length,text:markedText,occurredAt:'2022-09-09T13:00:00Z'}]};
 const projection=deterministicReadProjection(evidence);
 assert.ok(projection);
 assert.match(projection.sentences[0].text,/Maple went from 11\.8 kg on Sep 9, 2022 to 12\.7 kg now, an increase of 0\.9 kg/);
 assert.deepEqual(projection.sentences[0].sourceIds,['care:marked','profile:pet:weight']);
});

test('cross-year exact body-mass comparison projects both literal dates server-side',()=> {
 const requestText="Compare Ziggy's body weight recorded on September 13, 2022 with September 9, 2026 and give the exact kg change.";
 const oldText='Ziggy body weight was 8.7 kg on September 13, 2022 without equipment.';
 const newText='Ziggy body weight was 9.4 kg on September 9, 2026 without equipment.';
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:['pet'],requestedTopic:'weight',requestText,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
  sources:[{petId:'pet',source:'care_entries',status:'loaded',loadedIds:['care:old','care:new'],loadedCount:2,cap:null,reasons:[],completeness:{}}],
  completeness:{},losses:[],representation:'complete',verifiedFacts:[],petNames:{pet:'Ziggy'},
  interpretation:{request:{mode:'read',profileFields:[],temporalScope:'historical',outputFormat:null,referenceTurnIds:[]}},
  history:{corrections:'complete',provenance:[{sourceId:'care:old',status:'effective_linked'},{sourceId:'care:new',status:'effective_linked'}]},
  represented:[
   {sourceId:'care:old',petId:'pet',sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2022-09-13T12:00:00Z'},
   {sourceId:'care:new',petId:'pet',sourceType:'care_update',field:'value',start:0,end:newText.length,text:newText,occurredAt:'2026-09-09T12:00:00Z'}]};
 const projection=deterministicReadProjection(evidence);
 assert.ok(projection);
 assert.match(projection.sentences.map(x=>x.text).join(' '),/8\.7 kg.*9\.4 kg.*0\.7 kg/);
 assert.deepEqual(projection.sentences.at(-1).sourceIds,['care:old','care:new']);
 assert.equal(projection.sentences.at(-1).calculations[0].value,0.7);
});

test('latest multi-pet body mass projection requires one verified unblocked boundary per pet',()=> {
 const ids=Array.from({length:10},(_,i)=>`pet-${i+1}`), names=['Atlas','Clover','Cosmo','Juniper','Maple','Mochi','Nori','Pixel','Ziggy','Rowan'];
 const requestText='Give the latest recorded body weight for each of these 10 pets, keeping them separate. Include the date for each value.';
 const rows=ids.map((petId,i)=>({petId,sourceId:`care:latest-${i+1}`,text:i===0?'This morning his weight on our home scale registered at 5.10 kg.':`${names[i]} body weight was ${(2+i/2).toFixed(1)} kg on September 15, 2026 without equipment.`,occurredAt:'2026-09-15T12:00:00Z'}));
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:ids,requestedTopic:'weight',requestText,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'overview',status:'resolved',readOnlyRecall:true},
  sources:rows.map(row=>({petId:row.petId,source:'care_entries',status:'loaded',loadedIds:[row.sourceId],loadedCount:1,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}})),
  completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],representation:'complete',verifiedFacts:[],petNames:Object.fromEntries(ids.map((id,i)=>[id,names[i]]),
  ),interpretation:{selection:'latest',request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',outputFormat:'table',referenceTurnIds:[]}},
  history:{corrections:'complete',chronology:rows.map(row=>({petId:row.petId,boundaryIds:[row.sourceId],blocked:false})),provenance:rows.map(row=>({sourceId:row.sourceId,status:'effective_linked'}))},
  represented:rows.map(row=>({sourceId:row.sourceId,petId:row.petId,sourceType:'care_update',field:'value',start:0,end:row.text.length,text:row.text,occurredAt:row.occurredAt}))};
 const projection=deterministicReadProjection(evidence);
 assert.ok(projection); assert.equal(projection.sentences.length,1);
 for(const name of names) assert.match(projection.sentences[0].text,new RegExp(`\\| ${name} \\| 2026-09-15 \\|`));
 assert.equal(projection.sentences[0].sourceIds.length,10);
 const blocked=structuredClone(evidence);blocked.history.chronology[4].blocked=true;
 assert.equal(deterministicReadProjection(blocked),null);
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
  const result=validateAskRequest({version:'ask-request.v2',mode:'read',question:currentMessage,requirements:[],referenceTurnIds:['prior-check'],scope:'none',petNames:[],operation:'recall',selection:'reference',quantity:'records',topic:'receipts',terms:['receipts'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'}, {
    owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[
      {id:'save-turn',role:'user',text:'Save two separate notes for Fern: January 2: walked. January 4: played.'},
      {id:'prior-check',role:'user',text:'Verify the receipts for that save. Do not save them again.'},
      {id:'current-turn',role:'user',text:currentMessage}],
  });
  assert.equal(result.readOnly,true); assert.deepEqual(result.petIds,['pet']);
  assert.deepEqual(result.request.referenceTurnIds,['save-turn']); assert.equal(result.request.question,currentMessage);
});
test('a read about a correction drops a contradictory edit hint without granting write authority',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Check the correction receipt and quote the saved note. Do not save anything again.';
 const proposal={version:'ask-request.v2',mode:'read',mutationIntent:'correct_record',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'recall',selection:'reference',quantity:null,topic:'receipt',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'};
 const context={owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[{id:'edit',role:'user',text:'Correct Fern’s January 4 note to 14 minutes.'}]};
 const result=validateAskRequest(proposal,context);
 assert.equal(result.readOnly,true);assert.equal(result.request.mutationIntent,null);
 assert.deepEqual(result.request.referenceTurnIds,['edit']);
 const narrowed=validateAskRequest({...proposal,mode:'mixed',evidenceBasis:'general'},context);
 assert.equal(narrowed.readOnly,true);assert.equal(narrowed.request.mutationIntent,null);
 assert.throws(()=>validateAskRequest({...proposal,mode:'mixed',evidenceBasis:'general'},{...context,currentMessage:'Correct the saved note.'}),/correction_workflow/);
});
test('receipt reads preserve separate save and edit references but exclude unrelated or non-write turns',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'},other={id:'other',user_id:'owner',name:'Birch'};
 const currentMessage='Check Fern’s saved notes and correction receipts. Quote both notes. Save nothing.';
 const turns=[{id:'save',role:'user',text:'Save two notes for Fern: January 2: walked. January 4: played.'},
 {id:'other',role:'user',text:'Save a note for Birch: January 3: walked.'},
 {id:'check',role:'user',text:'Check Fern’s save receipts.'},
 {id:'assistant',role:'furvise',text:'Saved notes for Fern.'},
 {id:'edit',role:'user',text:'Correct Fern’s January 2 note to walked slowly.'}];
 const result=validateAskRequest({version:'ask-request.v2',mode:'read',question:currentMessage,requirements:[],referenceTurnIds:turns.map(t=>t.id),scope:'named',petNames:['Fern'],operation:'recall',selection:'reference',quantity:null,topic:'receipts',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history'}, {owner:{userId:'owner'},eligiblePets:[pet,other],pet,currentMessage,conversationTurns:turns});
 assert.deepEqual(result.request.referenceTurnIds,['save','edit']);assert.equal(result.readOnly,true);assert.deepEqual(result.petIds,['pet']);
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

test('publication preserves meaningful spaces in structured cells without optional offers', () => {
 for (const text of ['name,note\nFern,"two  spaces"','| Pet | Note |\n| --- | --- |\n| Fern | two  spaces |']) {
   assert.equal(enforceVerifiedStateClaims(text,false),text);
   const published=canonicalReadPresentation(text);
   assert.equal(readPublicationFailure(published),null);
 }
});
test('receipt completion requires every exact requested record and never trusts an assistant answer', () => {
  const requestText='Save two separate notes: January 2, 2026: walked 12 minutes. January 4, 2026: walked 18 minutes.';
  const records=[{id:'one',note:'January 2, 2026: walked 12 minutes.',occurredAt:'2026-01-02T00:00:00Z'}, {id:'two',note:'January 4, 2026: walked 18 minutes.',occurredAt:'2026-01-04T00:00:00Z'}];
  const requestedItems=records.map((r,i)=>({sourceSpanId:'turn:item:'+i,body:r.note,occurredAt:r.occurredAt,petId:'pet',sourceMessageId:'turn'}));
  records.forEach((r,i)=>Object.assign(r,{petId:'pet',sourceMessageId:'turn',sourceSpanId:requestedItems[i].sourceSpanId}));
  const receipt={sourceMessageId:'turn',petId:'pet',requestText,answerPersisted:true,requestedItems,records};
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


test('conversation references cannot turn reconstructed operation data into receipt authority', async()=>{
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
 for(const refs of [['save'],['answer'],['save','answer']]) { assert.deepEqual(build(refs).operationReceipts,[]); assert.equal(build(refs).sources.some(s=>s.source==='operation_receipts'),false); }
 for(const refs of [['missing'],['foreign'],['current']]) assert.deepEqual(build(refs).operationReceipts,[]);
 assert.deepEqual(build(['adjacent']).operationReceipts,[]);
 assert.equal(turns[0].operationReceipt.sourceMessageId,'old');
});

test('a mixed current-note date cannot narrow the independent historical lookup',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 const currentMessage='Fern weighed 14.8 kg on September 15, 2026. Log this note. Compare with her older 15 kg entry.';
 const proposal={version:'ask-request.v2',mode:'mixed',temporalScope:'historical_and_current',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'comparison',selection:'comparison',quantity:'measurement',topic:'weight',terms:['weight'],from:'2026-09-15',to:'2026-09-16',episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:'saved_history'};
 const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
 assert.ok(result);assert.equal(result.history.from,null);assert.equal(result.history.to,null);
 assert.equal(result.request.mode,'mixed');assert.equal(result.readOnly,false);
});

test('supplied comparison numbers never fulfill an explicit saved-record lookup',()=>{
 const pet={id:'pet',user_id:'owner',name:'Fern'};
 for(const command of ['look back at her 15 kg historical entry','verify her saved weight record','find her recorded result']) {
  const currentMessage=`Fern weighed 14.8 kg. Save this note. Then ${command} and calculate the difference from 15 kg.`;
  const proposal={version:'ask-request.v2',mode:'mixed',question:currentMessage,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Fern'],operation:'general',selection:'summary',quantity:'measurement',topic:'weight',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),evidenceBasis:null};
  const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[]});
  assert.equal(result.request.evidenceBasis,'saved_history');assert.ok(result.history);assert.equal(result.readOnly,false);
 }
});
const {requestsSavedRecordLookup}=await import('../app/lib/intelligence/ask-request-contract.ts');
for(const text of ['Do not check saved records. Use these two numbers only.', 'Suppose you could find a historical record.', 'Rowan ate normally. Save this note to history.', 'Repeat this sentence: "Find his historical entry."'])
 test(`no invented lookup authority: ${text}`,()=>assert.equal(requestsSavedRecordLookup(text),false));

test('mixed linked and unlinked conversation receipts confer no factual readback authority',()=>{
 const receipts=[{sourceMessageId:'save',petId:'pet',requestText:'Save this observation.',answerPersisted:true,records:[{id:'note',note:'An observation.',occurredAt:'2026-09-15T12:00:00Z'}]},
 {sourceMessageId:'check',petId:'pet',requestText:'Did the note save correctly?',answerPersisted:true,records:[]}];
 const evidence={scope:{requestText:'Did my notes save correctly? Show what was stored.',readOnlyRecall:true,authorizedPetIds:['pet']},
 interpretation:{request:{referenceTurnIds:['save','check']}},operationReceipts:receipts,sources:[],represented:[],losses:[]};
 const before=structuredClone(evidence);
 assert.equal(deterministicReadProjection(evidence),null);
 assert.deepEqual(evidence,before,'declining proofless readback must not mutate the source fixture');
 assert.match(receiptCompletionText(receipts[0]),/1 current care-history entry linked/);
});

test('linked saved-note text cannot substitute for canonical receipt authority',async()=>{
  const {operationReceiptEvidence}=await import('../app/lib/intelligence/ask-evidence.ts');
  const receipt={sourceMessageId:'save-turn',petId:'pet',requestText:'Fern skipped breakfast. Save that for today.',answerPersisted:true,records:[{id:'note',note:'Fern skipped breakfast.',occurredAt:'2026-09-18T12:00:00Z'}]};
  const receiptSources=operationReceiptEvidence([receipt]);
  const represented=receiptSources.map(source=>({...source,sourceType:'operation_receipt',field:'value',start:0,end:source.text.length}));
  const evidence={scope:{requestText:'What did I just save for Fern?',readOnlyRecall:true,authorizedPetIds:['pet']},petNames:{pet:'Fern'},
    sources:[{petId:'pet',source:'operation_receipt',status:'loaded',loadedIds:receiptSources.map(s=>s.sourceId),loadedCount:receiptSources.length,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}}],
    represented,losses:[],operationReceipts:[receipt],interpretation:{request:{mode:'read',evidenceBasis:'saved_history',outputFormat:'prose',referenceTurnIds:['save-turn']}},history:null};
  const {publicationSources}=await import('../app/lib/intelligence/publication-authority.ts');
  assert.equal(deterministicReadProjection(evidence),null);
  assert.deepEqual(publicationSources(evidence),[]);
});

test('plain owner readback language cannot be rejected as an invented save task',()=>{
 const currentMessage="Bramble's on a different food than last month right? What did I write down?";
 const pet={id:'bramble',user_id:'owner',name:'Bramble'};
 const currentTurn={id:'turn',role:'user',text:currentMessage,createdAt:'2026-09-18T20:00:00Z'};
 const proposal={version:'ask-request.v2',task:{intent:'save',sourceTurnId:'turn',petName:'Bramble',answerRequest:null},temporalScope:'historical',
  mutationIntent:null,recordSelection:null,profileFields:[],projection:null,mode:'mixed',question:currentMessage,requirements:[],evidenceNeeds:[],
  outputFormat:'prose',evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',petNames:['Bramble'],
  operation:'general',selection:'summary',quantity:null,topic:'food',terms:['food'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
 const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage,conversationTurns:[currentTurn],currentTurn});
 assert.equal(result.request.mode,'read'); assert.equal(result.request.task,null); assert.equal(result.request.evidenceBasis,'saved_history'); assert.equal(result.readOnly,true);
 assert.deepEqual(result.petIds,['bramble']);
});
test('owner readback phrases are recognized without granting save authority',()=>{
 for(const text of ['What did I write down?','What did I log for Bramble?','What did I save?','What is in my notes?','From my history, what changed?'])
  assert.equal(requestsSavedRecordLookup(text),true,text);
});

test('already-saved mixed turn strips stale save task before validating companion read',()=>{
  const pet={id:'cedar',user_id:'owner',name:'Cedar'};
  const current="tell me Cedar's last two weights and whether this note includes a weight.";
  const proposal={
    version:'ask-request.v2',mode:'mixed',question:current,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Cedar'],
    operation:'recall',selection:'latest',quantity:'measurement',topic:'weight',terms:['weight'],from:null,to:null,episodeTopic:null,ordinal:null,
    frame:{mentions:[],claims:[]},evidenceBasis:'saved_history',task:{intent:'save',sourceTurnId:'source',petName:'Cedar',answerRequest:null},
    temporalScope:'historical',mutationIntent:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,premiseQuotes:null,excludedPetNames:[]
  };
  const result=validateAskRequest(proposal,{owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage:current,conversationTurns:[],currentTurn:{id:'current',role:'user',text:current,createdAt:'2026-09-19T05:30:00Z'},pendingTask:null,ownerNoteAlreadySaved:true});
  assert.equal(result.request.mode,'read');
  assert.equal(result.request.task,null);
  assert.equal(result.readOnly,true);
});
