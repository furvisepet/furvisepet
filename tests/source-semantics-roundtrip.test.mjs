
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppendJob,readBoundAppendJob,appendJobProposal} from '../app/lib/furvise-brain/append-job.ts';
import {validateReplaceJob,readBoundReplaceJob,replaceJobProposal} from '../app/lib/furvise-brain/replace-job.ts';
const source={id:'source',role:'user',text:'Replace the record with:\n  Exact \u03b1\n\tobservation.  ',createdAt:'2026-09-20T12:00:00Z'};
const pet={id:'pet',name:'Quartz',user_id:'owner'},body='  Exact \u03b1\n\tobservation.  ';
for(const semantics of [
 {classification:'observation',target:null},
 {classification:'unknown',target:null},
 {classification:'attributed_correction',target:{kind:'target_unknown'}},
 {classification:'attributed_correction',target:{kind:'scope',from:'2014-07-01T00:00:00Z',to:'2014-08-01T00:00:00Z',conceptKey:null}},
])for(const operation of ['append','replace'])test(operation+' exact source semantics survives proposal, persistence and reload: '+JSON.stringify(semantics),()=>{
 const bind=p=>operation==='append'?validateAppendJob(p,source,[pet],'owner'):validateReplaceJob(p,source,pet);
 const job=bind(operation==='append'?{operation,petName:pet.name,items:[{bodyQuote:body,dateQuote:null,occurredAt:null,semantics}],companionQuote:null}:
  {operation,target:'last_event_for_subject',petName:pet.name,instructionQuote:source.text.trim(),bodyQuote:body,constraints:[],semantics});
 const payload=JSON.parse(JSON.stringify({[operation+'Job']:job}))[operation+'Job'];
 const read=operation==='append'?readBoundAppendJob:readBoundReplaceJob;
 assert.deepEqual(read(payload),job);
 assert.deepEqual(bind(operation==='append'?appendJobProposal(job,pet.name):replaceJobProposal(job,source.text,pet.name)),job);
 assert.deepEqual(operation==='append'?job.items[0].semantics:job.semantics,semantics);
 assert.equal(operation==='append'?job.items[0].body.text:job.body.text,body);
 const tampered=structuredClone(payload);(operation==='append'?tampered.items[0]:tampered).semantics.target={kind:'source',id:'unbound'};
 assert.equal(read(tampered),null);
});
