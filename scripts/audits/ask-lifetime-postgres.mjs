// Explicit opt-in: real disposable PostgreSQL writer -> reader -> production
// generation callback. Provider output only is synthetic; no HTTP/auth claim.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import { embeddedPostgres } from './helpers/embedded-postgres.mjs';
import { exercise, resolveAskTurnSubject, ASK_PROMPT_CONTEXT_CHAR_BUDGET } from './helpers/lifetime-harness.mjs'; // installs offline provider hooks
 // installs offline provider hooks
console.info=()=>{}; // only synthetic semantic trace chatter
const { governCanonicalEvents } = await import('../../app/lib/intelligence/semantic-events.ts');
const { persistSemanticEventRpc } = await import('../../app/lib/intelligence/semantic-event-persistence.ts');
const { generateAskHistoryAnswer } = await import('../../app/lib/intelligence/generate-ask-history.ts');
const { attachEpisodeReferences } = await import('../../app/lib/intelligence/episode-contract.ts');
const { buildAskConversationResponse } = await import('../../app/lib/ask.mjs');
const embedded = process.env.FURVISE_EMBEDDED_POSTGRES_DIR ? embeddedPostgres({dataDir:process.env.FURVISE_EMBEDDED_POSTGRES_DIR,packageDir:process.env.FURVISE_PGLITE_PACKAGE_DIR}) : null;
const container='furvise-stage2-db-2788f0b', database=embedded ? embedded.sql('select current_database();') : 'stage2_validation';
// A second invocation must not overlap this writer. A retained lock after a
// crash requires inspecting its PID before recovery; never restart blindly.
const lockPath=new URL('../../tmp/lifetime-postgres.lock',import.meta.url);
const lock=openSync(lockPath,'wx');writeFileSync(lock,JSON.stringify({pid:process.pid,container,database}));
const owner=randomUUID(), milo=randomUUID(), luna=randomUUID(), chat=randomUUID();
const quote=v=>v==null?'null':Array.isArray(v)?`array[${v.map(quote).join(',')}]::uuid[]`:typeof v==='object'?`${quote(JSON.stringify(v))}::jsonb`:`'${String(v).replaceAll("'","''")}'`;
let calls=0;
function sql(statement) {
 if (embedded) return embedded.sql(`set statement_timeout='8s'; set request.jwt.claim.sub=${quote(owner)}; set request.jwt.claim.role='service_role'; ${statement}`);
 if(calls++%10===0){
  const r=spawnSync('powershell.exe',['-NoProfile','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr); assert.ok(Number(r.stdout.trim())>2*1024*1024,'RAM cutoff: stopped below 2 GB free');
 }
 const r=spawnSync('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{
  input:`set statement_timeout='8s'; set request.jwt.claim.sub=${quote(owner)}; set request.jwt.claim.role='service_role'; ${statement}\n`,encoding:'utf8',timeout:15000,maxBuffer:4_000_000});
 assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
const json=statement=>JSON.parse(sql(statement));
const rpc=(name,args)=>{
 assert.match(name,/^(persist_furvise_server_semantic_event|read_ask_episode_sources|read_ask_history_candidates|read_ask_history_correction_page|read_ask_episode_references)$/);
 const pairs=Object.entries(args).map(([k,v])=>`${k}=>${Array.isArray(v)?`array[${v.map(quote).join(',')}]::${k==='p_keys'||k==='p_terms'?'text':'uuid'}[]`:quote(v)}`);
 const isRows=name==='persist_furvise_server_semantic_event'||name==='read_ask_history_candidates';
 const statement=isRows?`select coalesce(jsonb_agg(t),'[]') from public.${name}(${pairs}) t;`:`select public.${name}(${pairs});`;
 const request={abortSignal(){return this;},then(resolve,reject){return Promise.resolve().then(()=>({data:json(statement),error:null})).then(resolve,reject);}};
 return request;
};
const db={rpc};
let sequence=0;
async function write(note,transition,kind,date,pet=milo,active=[],topic='vomiting') {
 note=note.replace(/\.$/,` on ${date.slice(0,10)}.`);
 const source=randomUUID();
 sql(`insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text) values(${quote(source)},${quote(chat)},${quote(owner)},'user',${++sequence},${quote(note)});`);
 const proposal={subject:{type:'pet',name:pet===milo?'Milo':'Luna'},domain:'health',topic,eventTitle:'Health observation',transition,state:transition==='resolved'?'resolved':'active',temporal:{occurredAt:date,explicitTime:date.slice(0,10)},importance:'important',confidence:.99,sourceExcerpt:note,
  episodeBoundary:{kind,evidence:note,confidence:.99}};
 const g=governCanonicalEvents({proposals:[proposal],message:note,resolvedPetSubject:{id:pet,name:proposal.subject.name},activeEpisodes:active});
 assert.equal(g.accepted.length,1,JSON.stringify(g.rejected));
 assert.ok(g.accepted[0].recordedEvidence,`No provenance: ${note}`);
 const r=await persistSemanticEventRpc({event:g.accepted[0],fallbackPetId:pet,sourceMessageId:source,userId:owner,supabase:db});
 assert.equal(r.error,null);return {...r.data[0],source,proposal,event:g.accepted[0]};
}
const active=pet=>json(`select coalesce(jsonb_agg(e),'[]') from public.pet_care_episodes e where user_id=${quote(owner)} and pet_profile_id=${quote(pet)} and status in ('active','monitoring');`);
const read=()=>json(`select public.read_ask_episode_sources(${quote(milo)},array['vomiting','vomit']);`);
const log=[];
try {
 assert.equal(sql('select current_database();'),database);
 sql(`set request.jwt.claim.sub='' ; insert into auth.users(id) values(${quote(owner)}); insert into public.dog_profiles(id,user_id,name,species) values(${quote(milo)},${quote(owner)},'Milo','dog'),(${quote(luna)},${quote(owner)},'Luna','cat'); insert into public.ask_conversations(id,user_id,pet_profile_id,title) values(${quote(chat)},${quote(owner)},${quote(milo)},'Lifetime acceptance');`);
 const first=await write('Milo had his first bout of vomiting after breakfast.','started','opening','2011-02-01T12:00:00Z');
 await write('Milo was still vomiting that afternoon.','continued','continuation','2011-02-01T16:00:00Z',milo,active(milo));
 await write('Milo stopped vomiting completely.','resolved','resolution','2011-02-03T12:00:00Z',milo,active(milo));
 const second=await write('Milo had a separate bout of vomiting years later.','started','opening','2014-07-09T12:00:00Z');
 assert.notEqual(first.episode_id,second.episode_id);
 const data=read();
 assert.equal(data.episodes[1].recurrence_of,first.episode_id);
 assert.equal(data.recorded_census.episodeCount,2);assert.equal(data.recorded_census.sourceCount,4);
 log.push('real writer: two episodes, four notes, recurrence, natural wording');
 await write('Milo had his first bout of limping after a walk.','started','opening','2026-08-01T12:00:00Z',milo,[],'limping');
 for(let i=0;i<25;i++) await write('Milo was still limping after the walk.','continued','continuation',`2026-08-${String(i+2).padStart(2,'0')}T12:00:00Z`,milo,active(milo).filter(e=>e.normalized_key==='health_limping'),'limping');
 // Initialise the existing offline answer adapter, then call the real callback
 // with actual PostgreSQL RPCs and owned, database-loaded context.
 const baseline=await exercise('Summarize Milo history.');
 const provider=globalThis.__historyAuditClient.responses.create;
 globalThis.__historyAuditClient.responses.create=async request=>{
  assert.ok(request.input.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET,'actual model input remains bounded');
  return provider(request);
 };
 const context={...baseline.context,owner:{...baseline.context.owner,userId:owner},pet:json(`select to_jsonb(p) from public.dog_profiles p where id=${quote(milo)};`),
  eligiblePets:json(`select jsonb_agg(p) from public.dog_profiles p where user_id=${quote(owner)};`),conversationId:chat,conversationPetId:milo,currentMessage:'List all recorded vomiting episodes over Milo lifetime.',careEntries:[],careEpisodes:[],recentConversation:[]};
 async function ask(message,extra={}) {
  const result=await generateAskHistoryAnswer({supabase:db,context:{...context,currentMessage:message,...extra},requestId:'postgres-acceptance',sourceMessageId:randomUUID(),authoritativePetIds:[extra.pet?.id||milo]});
  return result;
 }
 const answer=await ask(context.currentMessage);
 assert.equal(answer.context.episodeResult.exactTotal,2,JSON.stringify(answer.context.episodeResult));
 assert.match(answer.intelligenceResult.reasoning.answer.summary,/Exactly 2 recorded vomiting episodes/);
 assert.equal(answer.context.episodeResult.items[0].startedAt.slice(0,10),'2011-02-01');
 log.push('old 2011 episode survives 26 newer irrelevant real writer entries');
 const period=await ask('List Milo vomiting episodes in 2014.');
 assert.equal(period.context.episodeResult.items[0].sequenceNumber,2);
 assert.equal(period.context.episodeResult.items[0].ordinal,1);
 log.push('stored sequence 2 displays as ordinal 1 in the requested 2014 period');
 await write('Milo had a soft-stool episode, February 1 to 3.','started','opening','2011-02-01T12:00:00Z',milo,[],'soft_stool');
 await write('Milo returned to normal stool after the first episode.','resolved','resolution','2011-02-03T12:00:00Z',milo,active(milo).filter(e=>e.normalized_key==='health_soft_stool'),'soft_stool');
 await write('Milo had a separate soft-stool episode, July 9 to 11.','started','opening','2014-07-09T12:00:00Z',milo,[],'soft_stool');
 await write('Milo returned to normal stool after the second episode.','resolved','resolution','2014-07-11T12:00:00Z',milo,active(milo).filter(e=>e.normalized_key==='health_soft_stool'),'soft_stool');
 const seeded=await ask('How many separate soft-stool episodes has Milo had over his lifetime?');
 assert.equal(seeded.context.episodeResult.exactTotal,2,JSON.stringify(seeded.context.episodeResult));
 assert.match(seeded.intelligenceResult.reasoning.answer.summary,/Exactly 2 recorded soft stool episodes/);
 log.push('original four Milo stool-note meanings through real writer and callback establish two episodes');
 const saved=attachEpisodeReferences(buildAskConversationResponse(answer.intelligenceResult.reasoning.answer),answer.context.episodeResult);
 assert.ok(saved.episodeReferences);
 sql(`insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data) values(${quote(randomUUID())},${quote(chat)},${quote(owner)},'furvise',${++sequence},${quote(saved)});`);
 const follow=await ask('What changed during the second episode?');
 assert.equal(follow.context.episodeResult.referenceStatus,'resolved',JSON.stringify(follow.context.episodeResult));
 assert.equal(follow.context.episodeResult.items[0].id,`episode:${second.episode_id}`);
 assert.equal(follow.context.episodeResult.items[0].ordinal,2);
 log.push('production callback + persisted reload: exact count, displayed second identity');
 await write('Luna had her first bout of vomiting.','started','opening','2012-03-01T12:00:00Z',luna);
 await write('Luna stopped vomiting completely.','resolved','resolution','2012-03-03T12:00:00Z',luna,active(luna));
 const lunaSecond=await write('Luna had a separate bout of vomiting.','started','opening','2015-03-01T12:00:00Z',luna);
 const lunaPet=context.eligiblePets.find(p=>p.id===luna);
 const lunaList=await ask('List all Luna vomiting episodes.',{pet:lunaPet});
 assert.equal(lunaList.context.episodeResult.exactTotal,2,JSON.stringify(lunaList.context.episodeResult));
 const lunaSaved=attachEpisodeReferences(buildAskConversationResponse(lunaList.intelligenceResult.reasoning.answer),lunaList.context.episodeResult);
 sql(`insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data) values(${quote(randomUUID())},${quote(chat)},${quote(owner)},'furvise',${++sequence},${quote(lunaSaved)});`);
 for(const message of ['What about her second episode?','What about the second episode?']) {
  const subject=await resolveAskTurnSubject({message,pets:context.eligiblePets,ownerId:owner,selectedPetId:milo,
   recentConversation:[{role:'user',text:'Tell me about Luna vomiting episodes.'}],extractFrame:async()=>{throw new Error('No provider extraction allowed');}});
  assert.equal(subject.resolution.petId,luna);
  const lf=await ask(message,{pet:lunaPet});
  assert.equal(lf.context.episodeResult.items[0]?.id,`episode:${lunaSecond.episode_id}`,JSON.stringify(lf.context.episodeResult));
 }
 log.push('Luna writer in Milo-anchored chat; pronoun/ordinal subject and persisted second reference retain Luna');
 sql(`insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data) values(${quote(randomUUID())},${quote(chat)},${quote(owner)},'furvise',${++sequence},${quote(saved)});`);
 // Retry uses the actual source identity: never another counted episode.
 const retry=await persistSemanticEventRpc({event:second.event,fallbackPetId:milo,sourceMessageId:second.source,userId:owner,supabase:db});
 assert.equal(retry.data[0].already_persisted,true);assert.equal(read().recorded_census.episodeCount,2);
 // Smaller correctness cases passed; now exceed the old 64-source application
 // inventory cap without increasing model input or inventing extra episodes.
 let last;
 for(let i=0;i<66;i++) last=await write('Milo was still vomiting that afternoon.','continued','continuation',`2014-07-10T12:${String(i%60).padStart(2,'0')}:00Z`,milo,active(milo).filter(e=>e.normalized_key==='health_vomiting'));
 const large=await ask(context.currentMessage);
 assert.equal(large.context.episodeResult.exactTotal,2,JSON.stringify(large.context.episodeResult));
 assert.equal(large.context.episodeResult.entryCount,70);
 assert.match(large.intelligenceResult.reasoning.answer.summary,/Exactly 2 recorded/);
 log.push('70 relevant source notes counted as two episodes by SQL; bounded display');
 const importSql=`select count(*) from public.import_legacy_semantic_claims_v2(${quote(owner)},'pet_care_entries',array(select id from public.pet_care_entries where user_id=${quote(owner)} and pet_profile_id=${quote(milo)} and care_event_metadata->>'semanticTopic'='vomiting'));`;
 sql(importSql);sql(importSql);
 const imported=await ask(context.currentMessage);
 assert.equal(imported.context.episodeResult.exactTotal,2,JSON.stringify(imported.context.episodeResult));
 assert.equal(imported.context.episodeResult.entryCount,70);
 const importedPeriod=await ask('List Milo vomiting episodes in 2011.');
 assert.equal(importedPeriod.context.episodeResult.exactTotal,1,JSON.stringify(importedPeriod.context.episodeResult));
 log.push('real duplicate import retains two episode identities and 70 unique care sources');
 // A separately committed connection mutates a non-displayed source while the
 // fake provider is generating. The callback must invalidate the old census.
 globalThis.__historyAuditAfterGeneration=()=>sql(`update public.pet_care_entries set note='Correction: this note was mistaken.' where id=${quote(last.care_entry_id)};`);
 const concurrent=await ask(context.currentMessage);
 globalThis.__historyAuditAfterGeneration=undefined;
 assert.equal(concurrent.context.episodeResult.coverage,'unavailable');
 assert.doesNotMatch(concurrent.intelligenceResult.reasoning.answer.summary,/Exactly 2/);
 log.push('committed mutation during generation invalidates undisplayed-source aggregate');
 sql(`update public.ask_conversation_messages set user_text='Correction: that vomiting belonged to Bruno, not Milo.' where id=${quote(second.source)};`);
 assert.equal(read().recorded_census,null);
 const stale=await ask('What changed during the second episode?');
 assert.equal(stale.context.episodeResult.referenceStatus,'stale');
 assert.doesNotMatch(JSON.stringify(stale.intelligenceResult.reasoning.answer),/separate bout/);
 log.push('source correction invalidates census and saved reference; idempotent replay deduplicated');
 assert.equal(json(`select private.read_ask_recorded_source_evidence(${quote(first.care_entry_id)});`).role,'opening');
 sql(`update public.pet_care_entries set deleted_at=now(),deletion_reason='synthetic acceptance deletion' where id=${quote(first.care_entry_id)};`);
 const deleted=await ask('What changed during the first episode?');
 assert.equal(deleted.context.episodeResult.referenceStatus,'stale');
 sql(`delete from public.pet_care_entries where id=${quote(first.care_entry_id)};`);
 assert.equal(read().recorded_census,null);
 log.push('soft deletion invalidates a previously valid saved first episode; hard deletion retains unknown completeness');
 const unaffected=await ask('List all Luna vomiting episodes.',{pet:lunaPet});
 assert.equal(unaffected.context.episodeResult.exactTotal,2,JSON.stringify(unaffected.context.episodeResult));
 assert.equal(json(`select affected_pet_ids from public.ask_recorded_inventory_removals where user_id=${quote(owner)};`).includes(milo),true);
 assert.equal(json(`select affected_pet_ids from public.ask_recorded_inventory_removals where user_id=${quote(owner)};`).includes(luna),false);
 log.push('Milo hard-deletion uncertainty does not block Luna two-episode census');
 console.log(JSON.stringify({passed:log},null,2));
} finally {
 try {
  sql(`delete from auth.users where id=${quote(owner)};`);
  assert.equal(sql(`select count(*) from public.pet_care_entries where user_id=${quote(owner)};`),'0');
  console.log('Synthetic owner and data cleaned up.');
 } finally {closeSync(lock);unlinkSync(lockPath);await embedded?.close();}
}
