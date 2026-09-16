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
const reportPath=new URL('../../docs/architecture/ask-authenticated-smoke-results.json',import.meta.url);
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
 const pet=await admin.from('dog_profiles').insert({user_id:userId,name:'Sable',species:'dog',age_value:4,age_unit:'years'}).select('id').single();
 if(pet.error)throw Error('Synthetic pet: '+pet.error.message);
 let conversationId=null,lastPayload;
 for(const message of ['so i gave him medicine yesterday','Sable','idk just save in notes']) {
  lastPayload={conversationId,petId:pet.data.id,message,logicalTurnId:randomUUID(),locale:'en-CA',timeZone:'America/Vancouver'};
  const response=await fetch(target+'/api/ask',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(lastPayload),signal:AbortSignal.timeout(90000)});
  const body=await response.json();
  report.turns.push({message,status:response.status,body});save();
  assert.equal(response.status,200,JSON.stringify({status:response.status,code:body.code,error:body.error}));
  assert.equal(body.success,true);
  conversationId=body.conversationId;
 }
 const saveTurn=report.turns.at(-1);assert.equal(saveTurn.body.creditsUsed,0,'saving an owner note is free');
 const replay=await fetch(target+'/api/ask',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(lastPayload),signal:AbortSignal.timeout(90000)});
 const replayBody=await replay.json();report.replay={status:replay.status,body:replayBody};save();assert.equal(replay.status,200);
 const entries=await admin.from('pet_care_entries').select('id,note,intelligence_source_message_id').eq('user_id',userId).is('deleted_at',null);
 if(entries.error)throw Error('Verify saved note: '+entries.error.message);
 report.entries=entries.data;save();
 assert.equal(entries.data.filter(x=>x.note==='so i gave him medicine yesterday').length,1,'one original owner observation');
 assert.ok(!entries.data.some(x=>x.note==='idk just save in notes'),'command is not note content');
 report.status='passed';
} catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
finally {
 await client.auth.signOut();
 if(userId){const removed=await admin.auth.admin.deleteUser(userId);report.cleanup=!removed.error;if(removed.error){report.cleanupError=removed.error.message;process.exitCode=1;}}
 save();console.log(JSON.stringify({status:report.status,error:report.error,turns:report.turns.map(t=>({message:t.message,status:t.status,creditsUsed:t.body.creditsUsed})),cleanup:report.cleanup}));
}
