import assert from 'node:assert/strict';
import test from 'node:test';
import { bindTypedReadTicket } from '../app/lib/furvise-brain/typed-read-ticket.ts';

const petIds=['subject-a','subject-b'];
const base=()=>({operation:'read',subjectScope:'named',temporal:{from:null,to:null,anchor:null,calendar:null},
 predicates:[{kind:'text_any',terms:['observation']}],searchHints:['observation'],needs:[],episode:null,
 outputs:{completeness:'sufficient',ordering:'desc',limit:null}});
const selection=(direction,count)=>({groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction}],take:{count,per:'group'}}]});
const finite=(direction='desc',count=2)=>({...base(),selection:selection(direction,count),outputs:{...base().outputs,ordering:direction}});
const need={needId:'need:0',from:'2024-06-01T00:00:00.000Z',to:'2024-07-01T00:00:00.000Z',target:'2024-06',termGroups:[['medication'],[]],ordering:'asc'};
const bindings=[{id:'need:0',petIds:['subject-b'],sourceSpanId:'user-turn:12:47'}];
const withNeed=()=>({...base(),predicates:[],searchHints:[],needs:[need],outputs:{...base().outputs,completeness:'exhaustive'}});

// Re-enter with caller-authorized subjects and the existing stored need bindings.
// This mirrors continuation's lossless needs projection, not a second binder.
function rebindStored(canonical){
 const store=new Map([['ticket',JSON.stringify(canonical)]]);
 const {subjects,needs,...proposal}=JSON.parse(store.get('ticket'));
 assert.ok(subjects.petIds.every(id=>petIds.includes(id)),'stored subjects must remain owned');
 return bindTypedReadTicket({...proposal,...(needs?{needs:needs.map(n=>({needId:n.id,from:n.from,to:n.to,target:n.target,termGroups:n.termGroups,ordering:n.ordering}))}: {})},subjects.petIds,needs||[]);
}
for(const [name,proposal,provenance] of [
 ['grouped take two',finite(),[]],
 ['earliest',finite('asc',1),[]],
 ['latest',finite('desc',1),[]],
 ['ordinary non-selection',{...base(),outputs:{...base().outputs,strategy:'chronological',completeness:'exhaustive'}},[]],
 ['needs and source-span provenance',withNeed(),bindings],
])test(name+' survives bind, JSON storage, parse and rebind unchanged',()=>{
 const before=JSON.stringify(proposal),canonical=bindTypedReadTicket(proposal,petIds,provenance);
 const rebound=rebindStored(canonical);
 assert.deepEqual(rebound,canonical);
 assert.equal(JSON.stringify(proposal),before);
 assert.equal(Object.isFrozen(rebound),true);
 for(const field of ['subjects','temporal','predicates','selection','outputs','needs','episode','searchHints'])assert.deepEqual(rebound[field],canonical[field]);
 if(canonical.needs?.length){assert.equal(rebound.needs[0].sourceSpanId,bindings[0].sourceSpanId);assert.deepEqual(rebound.needs[0].petIds,['subject-b']);}
});

test('absent and null selection preserve the same ordinary ticket',()=>{
 assert.deepEqual(bindTypedReadTicket({...base(),selection:null},petIds),bindTypedReadTicket(base(),petIds));
 assert.equal(bindTypedReadTicket(null,petIds),null);
});
for(const [name,change] of [
 ['malformed selection',p=>{p.selection={};}],
 ['selection with needs',p=>{p.predicates=[];p.searchHints=[];p.needs=[need];}],
 ['selection with episode',p=>{p.predicates=[];p.searchHints=[];p.episode={operation:'count',referent:{basis:'scoped_register',topic:null,ordinal:null}};}],
 ['selection with legacy strategy',p=>{p.outputs.strategy='chronological';}],
 ['selection with calendar',p=>{p.temporal.calendar='oldest_year';}],
 ['zero take',p=>{p.selection.union[0].take.count=0;}],
 ['fractional take',p=>{p.selection.union[0].take.count=1.5;}],
 ['oversized take',p=>{p.selection.union[0].take.count=101;}],
 ['invalid semantic ordering',p=>{p.selection.union[0].orderBy[0].direction='sideways';}],
 ['invalid output ordering',p=>{p.outputs.ordering='sideways';}],
 ['injected foreign subjects',p=>{p.subjects={petIds:['foreign-subject']};}],
])test(name+' remains fail-closed',()=>{
 const p=finite();change(p);const before=JSON.stringify(p);
 assert.throws(()=>bindTypedReadTicket(p,petIds,bindings),/ASK_REQUEST_INVALID:read_(ticket|needs)/);
 assert.equal(JSON.stringify(p),before);
});
for(const [name,provenance] of [
 ['missing binding',[]],
 ['missing source span',[{...bindings[0],sourceSpanId:''}]],
 ['foreign need subject',[{...bindings[0],petIds:['foreign-subject']}]],
])test(name+' cannot reauthorize a stored need',()=>{
 assert.throws(()=>bindTypedReadTicket(withNeed(),petIds,provenance),/ASK_REQUEST_INVALID:read_needs/);
});
test('foreign persisted subjects fail in continuation before factual retrieval',async()=>{
 const {engineFixture:fixture,id}=await import('./helpers/ask-route-ordering.mjs');
 const {continueConfirmedAppend}=await import('../app/lib/intelligence/append-turn.ts');
 const f=fixture();assert.equal((await f.send()).status,200);
 const confirmed=await(await f.confirm()).json();assert.equal(confirmed.action.status,'succeeded');
 const row=f.rows.ask_conversation_messages.find(row=>row.id===id(61));
 const stored=row.response_data=JSON.parse(JSON.stringify(row.response_data));
 stored.pendingAppend.readTicket.subjects.petIds=[id(99)];
 f.state.events.length=0;
 await assert.rejects(()=>continueConfirmedAppend({supabase:f.db,userId:id(1),assistantMessageId:id(61),action:confirmed.action}),/APPEND_CONTINUATION_SCOPE/);
 assert.ok(!f.state.events.includes('read:pet_care_entries'));assert.equal(f.state.planner,1);
});
