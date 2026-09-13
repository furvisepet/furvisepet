// Explicit opt-in PostgreSQL/WASM check of the narrow cached-refusal repair.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const packageDir=process.env.FURVISE_PGLITE_PACKAGE_DIR;
if(!packageDir) throw new Error('Set FURVISE_PGLITE_PACKAGE_DIR to the installed PGlite package');
const {PGlite}=await import(pathToFileURL(`${packageDir}/dist/index.js`).href);
const db=new PGlite();
try {
 await db.exec(`create table idempotency_operations(id text,user_id text,operation_type text,idempotency_key text,payload_hash text,status text,response_status integer,response_body jsonb,error_code text,completed_at timestamptz,owner_token text,lease_expires_at timestamptz,updated_at timestamptz);
 create table ask_conversation_messages(user_id text,request_id text,role text);
 create table ai_usage_events(user_id text,feature text,logical_request_id text,settlement_disposition text);`);
 const cases=[
  {id:'rate409',expected:'failed_retryable'},
  {id:'rate429',status:429,expected:'failed_retryable'},
  {id:'providerReleased',status:429,code:'TEMPORARY_PROVIDER_FAILURE',credit:'release',expected:'failed_retryable'},
  {id:'answered',answer:true},
  {id:'creditComplete',credit:'complete'},
  {id:'creditUnknown',credit:null},
  {id:'success',success:true},
  {id:'foreignOperation',operation:'care.save'},
  {id:'trueConflict',code:'IDEMPOTENCY_CONFLICT'},
  {id:'terminalFailure',state:'failed_final'},
 ];
 for(const c of cases){
  await db.query('insert into idempotency_operations values($1,$2,$3,$1,$4,$5,$6,$7,null,now(),null,null,now())',[c.id,'owner',c.operation||'ask.submit.persisted_answer_v2','unchanged-hash',c.state||'completed',c.status||409,JSON.stringify({success:c.success||false,code:c.code||'RATE_LIMIT'})]);
  if(c.answer) await db.query("insert into ask_conversation_messages values('owner',$1,'furvise')",[c.id]);
  if('credit' in c) await db.query("insert into ai_usage_events values('owner','ask',$1,$2)",[c.id,c.credit]);
 }
 const before=(await db.query('select * from idempotency_operations order by id')).rows;
 const creditsBefore=(await db.query('select * from ai_usage_events order by logical_request_id')).rows;
 const migration=readFileSync(new URL('../../supabase/migrations/20260913152500_recover_cached_ask_admission_refusals.sql',import.meta.url),'utf8');
 await db.exec(migration);
 const after=(await db.query('select * from idempotency_operations order by id')).rows;
 for(const row of after){
  const c=cases.find(c=>c.id===row.id);assert.equal(row.status,c.expected||c.state||'completed',c.id);
  const old=before.find(x=>x.id===row.id);
  for(const key of ['user_id','operation_type','idempotency_key','payload_hash','response_status','response_body']) assert.deepEqual(row[key],old[key],`${c.id}:${key}`);
 }
 assert.deepEqual((await db.query('select * from ai_usage_events order by logical_request_id')).rows,creditsBefore);
 await db.exec(migration);
 assert.deepEqual((await db.query('select * from idempotency_operations order by id')).rows,after,'repair is idempotent');
 console.log(JSON.stringify({cases:cases.length,passed:true,creditsUnchanged:true,identityUnchanged:true,idempotent:true}));
} finally {await db.close();}
