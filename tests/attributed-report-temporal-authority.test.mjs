import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import {readTicketProviderSchema} from '../app/lib/furvise-brain/read-ticket-provider-schema.ts';
import {bindTypedReadTicket} from '../app/lib/furvise-brain/typed-read-ticket.ts';
import {completeInstantSchema,isCompleteInstant} from '../app/lib/furvise-brain/complete-instant.ts';

const validate=new Ajv({allErrors:true}).compile(readTicketProviderSchema);
const validateInstant=new Ajv().compile(completeInstantSchema);
const base=()=>({authority:'stored_report',operation:'read',subjectScope:'named',
 temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[],
 outputs:{strategy:null,completeness:'exhaustive',ordering:'asc',limit:null},
 searchHints:null,episode:null,selection:null,probes:[]});
function bind(wire){const {probes,...semantic}=wire;assert.deepEqual(probes,[]);return bindTypedReadTicket(semantic,['owned-subject']);}
const samples=[
 ['UTC','2023-11-01T00:00:00Z',true],
 ['zero offset','2023-11-01T00:00:00+00:00',true],
 ['positive offset','2023-11-01T05:45:12+05:45',true],
 ['negative offset','2023-11-01T23:15:45-07:30',true],
 ['fraction','2023-11-01T00:00:00.123456789Z',true],
 ['leap century','2000-02-29T12:00:00Z',true],
 ['leap year','2024-02-29T12:00:00Z',true],
 ['primary maximum offset','2023-11-01T12:00:00+23:59',true],
 ['negative zero offset','2023-11-01T12:00:00-00:00',true],
 ['missing zone','2023-11-01T00:00:00',false],
 ['date only','2023-11-01',false],
 ['short hour offset','2023-11-01T00:00:00+0:00',false],
 ['short compact offset','2023-11-01T00:00:00+000',false],
 ['compact offset','2023-11-01T00:00:00+0000',false],
 ['offset hour overflow','2023-11-01T00:00:00+25:00',false],
 ['offset minute overflow','2023-11-01T00:00:00-01:60',false],
 ['dangling offset','2023-11-01T00:00:00+',false],
 ['dangling offset colon','2023-11-01T00:00:00+00:',false],
 ['impossible month','2023-13-01T00:00:00Z',false],
 ['zero month','2023-00-01T00:00:00Z',false],
 ['zero day','2023-11-00T00:00:00Z',false],
 ['short month overflow','2023-11-31T00:00:00Z',false],
 ['February overflow','2023-02-30T00:00:00Z',false],
 ['non leap year','2023-02-29T00:00:00Z',false],
 ['non leap century','2100-02-29T00:00:00Z',false],
 ['hour overflow','2023-11-01T24:00:00Z',false],
 ['minute overflow','2023-11-01T00:60:00Z',false],
 ['second overflow','2023-11-01T00:00:60Z',false],
 ['missing seconds','2023-11-01T00:00Z',false],
 ['empty fraction','2023-11-01T00:00:00.Z',false],
 ['lowercase zone','2023-11-01T00:00:00z',false],
 ['leading whitespace',' 2023-11-01T00:00:00Z',false],
 ['trailing whitespace','2023-11-01T00:00:00Z ',false],
 ['trailing newline','2023-11-01T00:00:00Z\n',false],
 ['trailing CRLF','2023-11-01T00:00:00Z\r\n',false],
 ['trailing junk','2023-11-01T00:00:00Zignored',false],
];
for(const [label,value,expected] of samples){
 for(const field of ['from','to'])test('primary '+field+': '+label,()=>{
  const wire=base();wire.temporal[field]=value;
  assert.equal(validate(wire),expected);
  assert.equal(isCompleteInstant(value),expected);
  if(expected)assert.equal(bind(wire).temporal[field],value);
  else assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
 });
 for(const domain of ['recorded','target'])for(const field of ['from','to'])
 test('attributed '+domain+'.'+field+': '+label,()=>{
  const wire=base();
  const c={recorded:{from:'2500-01-01T00:00:00Z',to:'2600-01-01T00:00:00Z'},
   target:{from:'1600-01-01T00:00:00Z',to:'1800-01-01T00:00:00Z'}};
  if(domain==='recorded')c.recorded={from:'1900-01-01T00:00:00Z',to:'2400-01-01T00:00:00Z'};
  else c.target={from:'1600-01-01T00:00:00Z',to:'2400-01-01T00:00:00Z'};
  c[domain][field]=value;wire.attributedContexts=[c];
  assert.equal(validate(wire),expected);
  if(expected)assert.deepEqual(bind(JSON.parse(JSON.stringify(wire))).attributedContexts,[c]);
  else assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
 });
}
test('calendar validity agrees for every day around century and leap boundaries',()=>{
 for(const year of [1900,1999,2000,2001,2004,2023,2024,2099,2100,2400]){
  for(let month=1;month<=12;month++)for(let day=1;day<=32;day++){
   const leap=year%4===0&&(year%100!==0||year%400===0);
   const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
   const value=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')+'T12:34:56-03:30';
   assert.equal(isCompleteInstant(value),day<=days,value);
   assert.equal(validateInstant(value),day<=days,value);
  }
 }
});
test('primary supports open bounds; attributed obligations require closed windows',()=>{
 for(const from of [null,'2020-01-01T00:00:00Z'])for(const to of [null,'2021-01-01T00:00:00Z']){
  const wire=base();Object.assign(wire.temporal,{from,to});
  assert.equal(validate(wire),true);assert.deepEqual(bind(wire).temporal,wire.temporal);
 }
 for(const domain of ['recorded','target'])for(const field of ['from','to']){
  const wire=base();wire.attributedContexts=[{recorded:{from:'2024-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z'},target:{from:'2020-01-01T00:00:00Z',to:'2021-01-01T00:00:00Z'}}];
  wire.attributedContexts[0][domain][field]=null;
  assert.equal(validate(wire),false);assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
  delete wire.attributedContexts[0][domain][field];
  assert.equal(validate(wire),false);assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
 }
});
test('Binder retains interval and later-context ordering using absolute offsets',()=>{
 for(const domain of ['primary','recorded','target'])for(const to of ['2023-11-01T00:00:00Z','2023-10-31T23:59:59Z']){
  const wire=base();
  const window={from:'2023-11-01T02:00:00+02:00',to};
  if(domain==='primary')Object.assign(wire.temporal,window);
  else{
   wire.attributedContexts=[{recorded:{from:'2500-01-01T00:00:00Z',to:'2600-01-01T00:00:00Z'},target:{from:'1600-01-01T00:00:00Z',to:'1700-01-01T00:00:00Z'}}];
   wire.attributedContexts[0][domain]=window;
  }
  assert.equal(validate(wire),true,'cross-field ordering remains Binder-owned');
  assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
 }
 const wire=base();wire.attributedContexts=[{recorded:{from:'2024-01-01T01:00:00+01:00',to:'2025-01-01T00:00:00Z'},target:{from:'2023-01-01T00:00:00Z',to:'2024-01-01T00:00:00Z'}}];
 assert.deepEqual(bind(wire).attributedContexts,wire.attributedContexts);
 wire.attributedContexts[0].recorded.from='2024-01-01T00:59:59+01:00';
 assert.throws(()=>bind(wire),/ASK_REQUEST_INVALID/);
});
