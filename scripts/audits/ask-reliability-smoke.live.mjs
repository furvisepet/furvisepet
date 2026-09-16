// Explicit live smoke with a newly created synthetic account; never uses an owner session.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
if(!process.argv.includes('--run-live'))throw Error('Explicit --run-live required');
process.loadEnvFile(process.env.FURVISE_LIVE_ENV_FILE);
const target=process.env.FURVISE_SMOKE_URL||'http://127.0.0.1:3119';
assert.ok(['http://127.0.0.1:3119','https://www.furvise.com'].includes(target));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const report={target,scope:'Authenticated HTTP route, real provider and database, synthetic temporary user',turns:[],cleanup:false};
const reportPath=new URL('../../docs/architecture/ask-reliability-smoke-results.json',import.meta.url);
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
let userId;
try {
 const email=`codex-ask-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic release verification'}});
 if(created.error)throw Error('Synthetic user creation: '+created.error.message);
 userId=created.data.user.id;report.syntheticUserId=userId;save();
 // Admin-issued session for this newly created test identity; no email is sent.
 const link=await admin.auth.admin.generateLink({type:'magiclink',email});
 if(link.error)throw Error('Synthetic login link: '+link.error.message);
 const signed=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'});if(signed.error)throw Error('Synthetic session: '+signed.error.message);
 const token=signed.data.session.access_token;
 const pet=await admin.from('dog_profiles').insert({user_id:userId,name:'Sable',species:'dog',sex:'male',age_value:4,age_unit:'years'}).select('id').single();
 if(pet.error)throw Error('Synthetic pet: '+pet.error.message);
 const other=await admin.from('dog_profiles').insert({user_id:userId,name:'Rowan',species:'dog',sex:'female'}).select('id').single();
 if(other.error)throw Error('Second pet: '+other.error.message);
 const now=Date.now();
 const rows=Array.from({length:28},(_,i)=>({user_id:userId,pet_profile_id:pet.data.id,category:'general',title:'Owner observation',occurred_at:new Date(now-(i+1)*86400000).toISOString(),note:'Sable rested normally after a short car ride. No weakness was noticed during this outing. '+('The owner recorded a routine travel observation, without a veterinary examination or diagnosis. '.repeat(8))}));
 const seeded=await admin.from('pet_care_entries').insert(rows);if(seeded.error)throw Error('History seed: '+seeded.error.message);
 let conversationId=null,lastPayload;
 for(const message of ['What was the last food change I recorded?','Did the vet ever diagnose arthritis?','What is the earliest care note you have for this pet?','Sable seemed more tired than usual on this morning’s walk and only ate half her breakfast. Save this.','Also add that she drank normally.','Did the note from this morning save correctly? Show me exactly what was stored.','Is there anything in the history that would make a long car ride risky right now?']) {
  lastPayload={conversationId,petId:pet.data.id,message,logicalTurnId:randomUUID(),locale:'en-CA',timeZone:'America/Vancouver'};
  const started=Date.now();
  const response=await fetch(target+'/api/ask',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(lastPayload),signal:AbortSignal.timeout(90000)});
  const body=await response.json();
  report.turns.push({message,status:response.status,elapsedMs:Date.now()-started,body});save();
  assert.equal(response.status,200,JSON.stringify({status:response.status,code:body.code,error:body.error}));
  assert.equal(body.success,true);
  conversationId=body.conversationId;
 }
 const entries=await admin.from('pet_care_entries').select('id,note,pet_profile_id,intelligence_source_message_id').eq('user_id',userId).is('deleted_at',null);
 if(entries.error)throw Error('Verify notes: '+entries.error.message);
 report.entries=entries.data;save();
 for(const [index,note] of [[3,'Sable seemed more tired than usual on this morning’s walk and only ate half her breakfast. Save this.'],[4,'Also add that she drank normally.']]) {
  assert.equal(report.turns[index].body.creditsUsed,0,'owner saves are free');
  assert.equal(entries.data.filter(entry=>entry.note===note&&entry.pet_profile_id===pet.data.id).length,1,'follow-up saved once to Sable');
 }
 assert.match(report.turns.at(-1).body.answer || '',/tired|fatigue|half.*breakfast/i,'current decisive observation must reach the answer');
 assert.ok((report.turns[5].body.answer||'').includes('Sable seemed more tired than usual'), 'readback must expose the original note');
 report.status='passed';
} catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
finally {
 await client.auth.signOut();
 if(userId){const removed=await admin.auth.admin.deleteUser(userId);report.cleanup=!removed.error;if(removed.error){report.cleanupError=removed.error.message;process.exitCode=1;}}
 save();console.log(JSON.stringify({status:report.status,error:report.error,turns:report.turns.map(t=>({message:t.message,status:t.status,creditsUsed:t.body.creditsUsed})),cleanup:report.cleanup}));
}
