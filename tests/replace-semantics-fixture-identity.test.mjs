import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './helpers/replace-semantics-fixtures.mjs';
import {replacementFixturePairs,assertReplacementFixturePair,preflightReplacementFixture} from './helpers/replace-semantics-pair-preflight.mjs';
const pairs=replacementFixturePairs(fixture);
for(const pair of pairs)test(`actual Binder/SQL seed identity: ${pair.name}`,()=>assertReplacementFixturePair(pair));
test('all ten positives and the 1001 UTF-16 negative are retained',()=>{
 const result=preflightReplacementFixture(fixture);assert.equal(result.positiveCount,10);assert.equal(result.utf16NegativeRetained,true);
 assert.deepEqual(pairs.map(x=>x.name),['ordinary-1','ordinary-2','ordinary-3','ordinary-4','ordinary-5','legacy','foreign-1','latest','unicode-1','unicode-2']);
});
const wrong='89300000-0000-4000-8000-000000000999';
for(const [name,change]of Object.entries({
 requestPrefix:p=>{p.action.id=wrong+':replace';},missingRequest:p=>{delete p.source.requestId;},sourceSeedRequest:p=>{p.sourceRow.request_id=wrong;},assistantSeedRequest:p=>{p.assistantRow.request_id=wrong;},
 actionSource:p=>{p.action.sourceMessageId=wrong;},boundSource:p=>{p.action.replaceJob.sourceMessageId=wrong;},sourceSeedId:p=>{p.sourceRow.id=wrong;},sourceOwner:p=>{p.sourceRow.user_id=wrong;},assistantOwner:p=>{p.assistantRow.user_id=wrong;},referenceOwner:p=>{p.reference.ownerId=wrong;},actionPet:p=>{p.action.petId=wrong;},boundPet:p=>{p.action.replaceJob.petId=wrong;},referencePet:p=>{p.reference.petId=wrong;},
}))test(`pair preflight rejects ${name} drift across every positive`,()=>{for(const value of pairs){const p=structuredClone(value);change(p);assert.throws(()=>assertReplacementFixturePair(p));}});
test('native seed uses the same serialized current source request for USER and assistant; other assertions byte-preserved',()=>{
 const sql=readFileSync(new URL('./sql/replace-semantics-native.sql',import.meta.url),'utf8');
 assert.equal(sql.split("request:=(f#>>'{source,requestId}')::uuid;").length-1,1);
 assert.equal(sql.split("request:=(v#>>'{source,requestId}')::uuid;").length-1,1);
 // Restore ONLY the two identity assignments and compare the sealed accepted SQL
 // fixture hash: all mint/claim/count/receipt/replay/staleness/rollback controls stay exact.
 const before=sql.replace("request:=(f#>>'{source,requestId}')::uuid;","request:=('89300000-0000-4000-8000-'||lpad((off+9)::text,12,'0'))::uuid;")
  .replace("request:=(v#>>'{source,requestId}')::uuid;","request:=('89300000-0000-4000-8000-'||lpad((400+i)::text,12,'0'))::uuid;");
 assert.equal(createHash('sha256').update(before).digest('hex'),'d3a7f494514504c579096eb9659599b53f8d1a6734370b90292fc25a6978adf2');
});
