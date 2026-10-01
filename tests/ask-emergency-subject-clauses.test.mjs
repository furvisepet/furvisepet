import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {detectImmediateAskEmergency} from '../app/lib/ask-safety-context.ts';
import {fixture} from './helpers/ask-route-ordering.mjs';

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
 const f=fixture({creditLedger:true,realEmergencyResponse:true,providerCreate:async()=>{throw Error('URGENT_MUST_NOT_PLAN');}});
 const before=structuredClone(f.rows),r=await f.send(message),body=await r.json();
 const actual={http:r.status,plannerCalls:f.state.planner,safety:body.safety?.level,events:f.state.events,rowsUnchanged:JSON.stringify(f.rows)===JSON.stringify(before),saved:body.persistence?.saved,creditsUsed:body.creditsUsed,capabilities:f.rows.ask_action_capabilities.length};
 if(journal&&process.env.FURVISE_SUBJECT_ROUTE_JOURNAL)
  writeFileSync(process.env.FURVISE_SUBJECT_ROUTE_JOURNAL,JSON.stringify({scenario:frozen.sourceScenario.id,expected:frozen.sourceScenario.expected,actual},null,2),{flag:'wx'});
 assert.equal(r.status,200);assert.equal(actual.plannerCalls,0);assert.equal(actual.safety,'urgent');
 assert.deepEqual(f.rows,before);assert.deepEqual(f.state.events,[]);assert.equal(body.persistence.saved,false);assert.equal(body.dataChanged,false);assert.equal(body.creditsUsed,0);assert.equal(actual.capabilities,0);assert.equal(f.state.credit,null);
}
test('RC1001-007 separate frozen regression preserves campaign oracle',async()=>{
 assert.equal(frozen.sourceScenario.id,'RC1001-007');
 await urgentRoute(frozen.sourceScenario.input.question,true);
});
for(const conjunction of ['while','whereas'])test('urgent compound route before correction/read/write '+conjunction,async()=>{
 await urgentRoute(`Alder is choking ${conjunction} Rue is breathing normally. Correct Rue's meal date to 2024-05-19 and show Alder's earliest weight.`,false);
});
