import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{readWriteSourceSemantics,sourceSemanticsSchema,SOURCE_SEMANTICS_INSTANT_PATTERN}from'../app/lib/furvise-brain/source-semantics.ts';
import{validateReplaceJob,readBoundReplaceJob,rebindReplaceJob}from'../app/lib/furvise-brain/replace-job.ts';
const vectors=JSON.parse(readFileSync(new URL('./fixtures/write-semantics-parity.json',import.meta.url),'utf8')).vectors;
const subject={id:'89300000-0000-4000-8000-000000000002',name:'Synthetic Subject'},owner='89300000-0000-4000-8000-000000000001';
const body='It’s steady – “café” 🐾.',source={id:'89300000-0000-4000-8000-000000000004',text:'Replace the last entry with: '+body,createdAt:'2026-01-12T12:00:00.000Z'};
const proposal={operation:'replace',target:'last_event_for_subject',petName:subject.name,instructionQuote:source.text,bodyQuote:body,constraints:[]};
const base=validateReplaceJob({...proposal,semantics:{classification:'observation',target:null}},source,subject);
for(const v of vectors)test(v.name+': direct/proposal/stored/rebind parity',()=>{
 const p={...proposal,semantics:v.semantics},stored={...base,semantics:v.semantics};
 if(v.expected){assert.deepEqual(readWriteSourceSemantics(v.semantics),v.semantics);const j=validateReplaceJob(p,source,subject);assert.deepEqual(readBoundReplaceJob(j),j);assert.deepEqual(rebindReplaceJob(j,source,subject,owner),j);assert.equal(j.body.text,body);assert.equal(j.body.end-j.body.start,body.length);assert.deepEqual(JSON.parse(Buffer.from(JSON.stringify(j),'utf8').toString('utf8')),j)}
 else{assert.equal(readWriteSourceSemantics(v.semantics),null);assert.throws(()=>validateReplaceJob(p,source,subject),e=>e.cause?.field==='writeJob.semantics');assert.equal(readBoundReplaceJob(stored),null);assert.throws(()=>rebindReplaceJob(stored,source,subject,owner),e=>e.cause?.field==='writeJob.semantics')}
});
test('provider schema remains string-only; SQL and TypeScript share exact instant pattern',()=>{
 for(const branch of sourceSemanticsSchema.anyOf)assert.equal(branch.properties.classification.type,'string');
 const sql=readFileSync('supabase/migrations/20261004171300_validate_canonical_replace_write_semantics.sql','utf8');assert.ok(sql.includes("regexp_match(s,'"+SOURCE_SEMANTICS_INSTANT_PATTERN+"')"));
});
for(const [units,expected]of [[1000,true],[1001,false]])test('Unicode UTF-16 body boundary '+units,()=>{
 const text='x'.repeat(units-2)+'🐾',s={...source,text:'Replace the last entry with: '+text},p={...proposal,instructionQuote:s.text,bodyQuote:text};
 assert.equal(text.length,units);if(expected){const j=validateReplaceJob(p,s,subject);assert.equal(j.body.end-j.body.start,units);assert.deepEqual(rebindReplaceJob(j,s,subject,owner),j)}else assert.throws(()=>validateReplaceJob(p,s,subject),e=>e.cause?.field==='writeJob.bodyQuote');
});
