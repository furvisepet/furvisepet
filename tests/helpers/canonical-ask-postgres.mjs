// Local-only SQL fixture transport. No database URL, host port, provider or remote service.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {validateAppendJob} from '../../app/lib/furvise-brain/append-job.ts';
export const id=n=>'b1000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const owner=id(1),pet=id(11),other=id(2),otherPet=id(12),conversation=id(21);
export const q=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
export const j=v=>q(JSON.stringify(v))+'::jsonb';
export const check=(condition,label)=>`if (${condition}) is not true then raise exception ${q(label)};end if;\n`;
export const block=body=>`do $test$ declare r record; replay record; denied boolean:=false; before_state jsonb; begin ${body} end $test$;\n`;
export function localSql(text){
 const container=process.env.FURVISE_TEST_CONTAINER;
 assert.match(container||'',/^furvise-ask-validation-[a-z0-9-]+$/);
 assert.equal(process.env.FURVISE_TEST_DATABASE,'ask_continuation_validation');
 const config=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
 assert.equal(config.HostConfig.NetworkMode,'none');
 assert.ok(config.HostConfig.Memory>0&&config.HostConfig.Memory<=512*1024*1024);
 assert.ok(config.HostConfig.NanoCpus>0&&config.HostConfig.NanoCpus<=1e9);
 try{return execFileSync('docker',['exec','-i',container,'psql','-h','/tmp','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','ask_continuation_validation'],{input:text,encoding:'utf8',timeout:20000,stdio:['pipe','pipe','pipe']});}
 catch(e){throw Error(e.stderr||e.message,{cause:e});}
}
export function setup(){return `BEGIN;SET LOCAL statement_timeout='10s';
insert into auth.users(id,aud,role,email,created_at,updated_at)values('${owner}','authenticated','authenticated','sql-a@example.test',now(),now()),('${other}','authenticated','authenticated','sql-b@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species)values('${pet}','${owner}','Subject','dog'),('${otherPet}','${other}','Other','cat');
insert into public.ask_conversations(id,user_id,pet_profile_id,title)values('${conversation}','${owner}','${pet}','Local checkpoint');
select set_config('request.jwt.claim.role','service_role',true);
`}
export const source=n=>({source:id(100+n*10),assistant:id(101+n*10),request:id(102+n*10),cap:id(103+n*10)});
export function turn(text,n=1){const s=source(n);return `insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,response_data,request_id,created_at)values('${s.source}','${conversation}','${owner}','user',${n*2-1},${q(text)},null,'${s.request}','2026-09-20T12:00:00Z'),('${s.assistant}','${conversation}','${owner}','furvise',${n*2},null,'{}','${s.request}','2026-09-20T12:00:01Z');\n`}
export function mint({n=1,kind='care_history.add',job,detail=null,target='null',explicit=false,extra={}}={}){
 const s=source(n),remove=kind==='care_history.remove',scope=kind.startsWith('care_state.')?'owned_concern':kind==='care_history.add'?'owned_pet':'owned_care_record';
 const payload={id:s.request+':action',kind,petId:pet,sourceMessageId:s.source,safetyClass:remove?'CONFIRMATION_REQUIRED':'LOW_RISK_REVERSIBLE',mutationClass:'mutation',confirmationPolicy:remove?'always':'explicit_intent',authorizationScope:scope,explicitIntent:explicit,input:{field:null,value:null,title:null,detail,category:null,target:'specified'},evidence:'Typed source',status:remove?'confirmation_required':'proposed',label:'Test',description:'Local test',href:null,resultMessage:null,errorMessage:null,...(job?{appendJob:job}:{}),...extra};
 return `insert into public.ask_action_capabilities(id,user_id,assistant_message_id,source_message_id,source_action_id,action_kind,pet_profile_id,target_id,safety_class,mutation_class,confirmation_policy,authorization_scope,explicit_intent,action_payload)values('${s.cap}','${owner}','${s.assistant}','${s.source}','${s.request}:action',${q(kind)},'${pet}',${target},${q(payload.safetyClass)},'mutation',${q(payload.confirmationPolicy)},${q(payload.authorizationScope)},${explicit},${j(payload)});\n`;
}
export const execute=(n=1,mode='confirm',user=owner)=>{const s=source(n);return `public.execute_ask_action_capability('${s.cap}','${s.assistant}','${user}',${q(mode)},null)`};
export const row=n=>`(select id from public.pet_care_entries where intelligence_source_message_id='${source(n).source}' order by created_at,id limit 1)`;
export function boundAppend(bodies,n=1){
 const text='\u{1F43E} Source:\n'+bodies.join('\n'),s=source(n);
 const job=validateAppendJob({operation:'append',petName:'Subject',items:bodies.map(bodyQuote=>({bodyQuote,dateQuote:null,occurredAt:null})),companionQuote:null},{id:s.source,role:'user',text,createdAt:'2026-09-20T12:00:00Z'},[{id:pet,name:'Subject',user_id:owner}],owner);
 return {text,job,sql:turn(text,n)+mint({n,job})};
}
export function append(bodies,n=1){return boundAppend(bodies,n).sql+block(`select * into r from ${execute(n)};`+check("r.changed and r.action->>'status'='succeeded'",'append failed'));}
export function ordinary({id:entry=id(61),category='symptom',title='Breathing event',note='Trouble breathing again.',severity='severe',who=owner,subject=pet}={}){
 return `insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,severity,occurred_at)values('${entry}','${who}','${subject}',${q(category)},${q(title)},${q(note)},${q(severity)},'2026-09-10T00:00:00Z');\n`;
}
export const snapshot=`jsonb_build_object('concerns',(select jsonb_agg(to_jsonb(c) order by c.id) from public.pet_concerns c),'episodes',(select jsonb_agg(to_jsonb(e) order by e.id) from public.pet_care_episodes e),'current',(select jsonb_agg(to_jsonb(s) order by s.pet_profile_id) from public.pet_current_state s))`;
export function replace({n=2,target=row(1),body='  Exact  replacement.\n\tPreserved.  '}={}){return turn('Replace with:\n'+body,n)+mint({n,kind:'care_history.edit',detail:body,target});}
