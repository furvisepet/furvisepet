import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {detectImmediateAskEmergency} from '../app/lib/ask-safety-context.ts';
import {readOnlyFailureRouteFixture} from './helpers/ask-read-only-failure-route.mjs';

const frozen=JSON.parse(readFileSync(new URL('./fixtures/emergency-subject-clauses-regression.json',import.meta.url),'utf8'));
const emergencies=[
 ['is choking','is breathing normally'],
 ['is gasping','is breathing normally'],
 ['is having a seizure','has stopped seizing'],
 ['is bleeding heavily','has stopped bleeding'],
];
const crossSubject=[];
for(const conjunction of ['while','whereas'])for(const [symptom,recovery] of emergencies)
 for(const [first,second]of [['Alder','Rue'],['Rue','Alder']])
  crossSubject.push(`${first} ${symptom} ${conjunction} ${second} ${recovery}.`);

test('contrast clauses isolate each emergency subject across symptom families',()=>{
 const observed=crossSubject.map(message=>({message,urgent:!!detectImmediateAskEmergency(message)}));
 if(process.env.FURVISE_SUBJECT_JOURNAL)
  writeFileSync(process.env.FURVISE_SUBJECT_JOURNAL,JSON.stringify({expected:'all urgent',observed},null,2),{flag:'wx'});
 assert.ok(observed.every(x=>x.urgent),JSON.stringify(observed.filter(x=>!x.urgent)));
});

for(const conjunction of ['while','whereas'])for(const [message,urgent]of [
 [`Alder is choking ${conjunction} Alder is breathing normally now.`,false],
 [`Alder is choking ${conjunction} he has stopped choking.`,false],
 [`Alder is choking ${conjunction} Rue is not breathing normally.`,true],
 [`Alder is choking ${conjunction} Rue might be breathing normally.`,true],
 [`Alder is not choking ${conjunction} Rue is breathing normally.`,false],
 [`Alder was choking yesterday ${conjunction} Rue was eating.`,false],
 [`If Alder is choking ${conjunction} Rue is asleep, what should we do?`,false],
 [`Hypothetically, Alder is choking ${conjunction} Rue is asleep.`,false],
 [`The old report says "Alder is choking ${conjunction} Rue is asleep." Alder is well today.`,false],
 [`Alder is choking ${conjunction} Rue is breathing normally. Alder has stopped choking.`,false],
 [`Alder has stopped choking ${conjunction} Rue is breathing normally. Alder is choking again.`,true],
 [`Alder is choking ${conjunction} Rue is breathing normally. Rue is not choking.`,true],
 [`Alder is choking ${conjunction} Rue is breathing normally. He has stopped choking.`,true],
 [`I am choking ${conjunction} my cat is breathing normally.`,false],
 [`My child is breathing normally ${conjunction} my dog is choking.`,true],
 [`My dog is choking ${conjunction} my child is breathing normally.`,true],
])test('contrast context: '+message,()=>assert.equal(!!detectImmediateAskEmergency(message),urgent));

async function urgentRoute(message,journal){
 const f=readOnlyFailureRouteFixture(()=>{throw Error("URGENT_MUST_NOT_CALL_PROVIDER");},[],{emergency:true});
 const r=await f.send(message),body=await r.json();
 const actual={http:r.status,plannerCalls:f.state.calls,safety:body.safety?.level,saved:body.persistence?.saved,creditsUsed:body.creditsUsed,careReads:f.state.reads,queriedTables:f.state.tables};
 if(journal&&process.env.FURVISE_SUBJECT_ROUTE_JOURNAL)
  writeFileSync(process.env.FURVISE_SUBJECT_ROUTE_JOURNAL,JSON.stringify({scenario:frozen.sourceScenario.id,originalOracle:frozen.sourceScenario.expected,actual,contractChange:"Only owner-bound Ask publication may persist; no care/profile effects."},null,2),{flag:"wx"});
 assert.equal(r.status,200);assert.equal(actual.plannerCalls,0);assert.equal(actual.safety,"urgent");
 assert.equal(body.persistence.saved,true);assert.equal(body.dataChanged,false);assert.equal(body.creditsUsed,0);
 assert.equal(body.carePersistence.status,"skipped");assert.equal(f.state.credit,null);
 assert.equal(f.state.reads,0);assert.deepEqual(f.state.tables,[]);assert.equal(f.state.emergencyWrites,1);assert.equal(f.state.userMessages,1);
}
test('RC1001-007 frozen input preserves urgent subject isolation with current chat publication',async()=>{
 assert.equal(frozen.sourceScenario.id,'RC1001-007');
 await urgentRoute(frozen.sourceScenario.input.question,true);
});
for(const conjunction of ['while','whereas'])test('urgent compound route before correction/read/write '+conjunction,async()=>{
 await urgentRoute(`Alder is choking ${conjunction} Rue is breathing normally. Correct Rue's meal date to 2024-05-19 and show Alder's earliest weight.`,false);
});
