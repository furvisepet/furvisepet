import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import * as C from "./helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitHistoryDays, explicitHistoryMonths } from '../app/lib/intelligence/history-dates.ts';
import { historyQueryTerms } from '../app/lib/intelligence/history-query-relevance.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { readFileSync } from 'node:fs';

test('benchmark shared trailing year keeps every explicit date/month target',()=>{
 assert.deepEqual(explicitHistoryDays('between September 8 and September 12, 2026',2026,8),['2026-09-08','2026-09-12']);
 assert.deepEqual(explicitHistoryMonths('Across June, July, and August 2026'),['2026-06','2026-07','2026-08']);
 const window={from:'2026-09-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'};
 const r=compileHistoryReadStrategies('September 12 than on September 11, 2026',2026,window,[{...window,descending:false,lexical:false,terms:[]}],4,[]);
 assert.deepEqual(r.strategies.filter(x=>x.target).map(x=>x.target).sort(),['2026-09-11','2026-09-12']);
});

test('latest appetite and energy hints include bounded owner-language aliases',()=>{
 const terms=historyQueryTerms(['appetite','energy'],['Sable']);
 assert.ok(terms.includes('appet'));
 assert.ok(terms.some(term=>['tired','slugg','letha','activ'].includes(term)));
 assert.ok(terms.some(term=>['eat','ate','intak','break'].includes(term)));
 assert.ok(terms.length<=6);
});

test('read-only subject resolution uses the validated multi-pet read scope',()=>{
 const source=readFileSync('app/lib/intelligence/interpret-ask.ts','utf8');
 assert.match(source,/interpretation\.readOnly && interpretation\.readPetIds\?\.length/);
 assert.match(source,/\? interpretation\.readPetIds : interpretation\.petIds/);
 assert.match(source,/subjects\.length > 1 \? "multi_subject"/);
 assert.match(source,/petIds: subjects/);
});
test("canonical comparison never reconstructs arithmetic from generated prose",async()=>{
 const f=await C.certified("difference",["29 minutes","15 minutes"],"minute",14,{unit:"minute"});const r={...f.response,historyNarrative:{sentences:[{text:"A different result",sourceIds:[]}]}};assert.ok(C.calculationPublicationFailure(r));assert.equal(f.calls(),0);
});test('native reads bind alternate owned handles and reject foreign or invented subjects before retrieval',async()=>{
 const input={ownerId:"owner",selectedPetId:"selected",question:"Show Sable's saved note.",
  pets:[{id:"selected",ownerId:"owner",name:"Dune",species:"cat"},
   {id:"alternate",ownerId:"owner",name:"Sable",species:"dog"},
   {id:"foreign",ownerId:"other-owner",name:"Foreign",species:"cat"}],
  dialogue:[],now:"2026-11-09T00:00:00Z",timeZone:"UTC"};
 const exercise=async handle=>{
  let calls=0,reads=0;
  const pending=runReadOnlyAsk(input,{
   read:async request=>{reads++;assert.equal(request.pet.ownerId,"owner");assert.equal(request.pet.id,"alternate");return{sources:[],total:0};},
   provider:async request=>{
    calls++;assert.equal(request.context.selectedPet,"p1");
    assert.deepEqual(request.context.pets.map(p=>p.name),["Dune","Sable"]);
    return calls===1
     ?{calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:handle,from:null,to:null,query:null,offset:0})}],text:""}
     :{answer:"I could not find a saved note.",quotes:[],sources:[],calculations:[],replyType:"partial"};
   }
  });
  return{pending,counts:()=>({calls,reads})};
 };
 const owned=await exercise("p2");await owned.pending;assert.deepEqual(owned.counts(),{calls:2,reads:1});
 for(const handle of ["p3","foreign","invented"]){
  const denied=await exercise(handle);
  await assert.rejects(denied.pending,/ASK_READ_PET_NOT_AUTHORIZED/);
  assert.deepEqual(denied.counts(),{calls:1,reads:0});
 }
 const guard=readFileSync('app/lib/intelligence/selected-pet-read.ts','utf8');
 assert.match(guard,/explicitOwnedAlternateRead/);
 assert.match(guard,/explicit\.has\(id\)/);
 assert.match(guard,/interpretation\.readOnly && interpretation\.request\?\.mode === "read"/);
});
