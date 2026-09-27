
import test from 'node:test';
import {localSql,setup,turn,mint,boundAppend,append,replace,ordinary,execute,row,block,check,q,j,id,source,owner,pet,other,otherPet} from '../../tests/helpers/canonical-ask-postgres.mjs';
import {validateAppendJob,appendJobProposal} from '../../app/lib/furvise-brain/append-job.ts';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'\nROLLBACK;'));
const semantics={classification:'attributed_correction',target:{kind:'scope',from:'2014-07-01T00:00:00Z',to:'2014-08-01T00:00:00Z',conceptKey:null}};
const payload=(entry=id(61),meaning=semantics)=>`(select (jsonb_build_object('version','source-semantics.v1','source',private.ask_source_semantics_snapshot(e))||${j(meaning)})::text from public.pet_care_entries e where e.id=${q(entry)})`;
const importIt=(entry=id(61),meaning=semantics)=>`select public.import_ask_source_semantics('${owner}',${payload(entry,meaning)});\n`;
const authenticated=`select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;\n`;
const read=`public.read_ask_source_semantics(array['${pet}'::uuid],array['${id(61)}'::uuid])`;
run('reviewed legacy import is source-exact, non-effective, readable and idempotent',ordinary()+importIt()+importIt()+block(
 check("(select count(*) from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload')=1",'import replay duplicated')+
 check("not exists(select 1 from public.semantic_claim_relations)",'attribution invented edge')+
 check("not exists(select 1 from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload' and knowledge_status<>'unconfirmed')",'attribution became effective'))+
 authenticated+block(check(`(${read}->>'complete')::boolean`,'typed import incomplete')+check(`jsonb_array_length(${read}->'claims')=1`,'typed claim missing'))+'reset role;');
run('unclassified legacy source is explicitly incomplete',ordinary()+authenticated+block(check(`not(${read}->>'complete')::boolean`,'unmigrated source assumed observation'))+'reset role;');
run('source mutation invalidates existing attributed snapshot',ordinary()+importIt()+`update public.pet_care_entries set note='Changed exact body' where id='${id(61)}';`+authenticated+block(check(`not(${read}->>'complete')::boolean`,'changed source certified'))+'reset role;');
run('foreign source cannot be imported by another owner',ordinary()+block(
 `begin perform public.import_ask_source_semantics('${other}',${payload()});exception when others then denied:=sqlerrm='SOURCE_SEMANTICS_SOURCE_CHANGED';end;`+check('denied','foreign import accepted')));
run('authenticated caller cannot invoke reviewed import',ordinary()+authenticated+block(
 `begin perform public.import_ask_source_semantics('${owner}','{}');exception when insufficient_privilege then denied:=true;end;`+check('denied','client import privilege'))+'reset role;');
run('foreign pet read is rejected without leaking attribution',ordinary()+importIt()+authenticated+block(
 `begin perform public.read_ask_source_semantics(array['${otherPet}'::uuid],'{}');exception when others then denied:=sqlerrm='SOURCE_SEMANTICS_SCOPE_INVALID';end;`+check('denied','foreign read'))+'reset role;');
run('same-source conflicting attributed semantics cannot overwrite reviewed authority',ordinary()+importIt()+block(
 `begin perform public.import_ask_source_semantics('${owner}',${payload(id(61),{classification:'observation',target:null})});exception when others then denied:=sqlerrm='SOURCE_SEMANTICS_REPLAY_MISMATCH';end;`+check('denied','semantic replay mismatch accepted')));
run('attribution cannot promote itself to effective or change target',ordinary()+importIt()+block(
 `begin update public.semantic_claims set knowledge_status='effective' where governance_metadata ? 'sourceSemanticsPayload';exception when others then denied:=sqlerrm='ATTRIBUTED_SOURCE_IMMUTABLE';end;`+check('denied','effective promotion accepted')));
run('attribution cannot enter the effective correction graph',ordinary()+importIt()+ordinary({id:id(62),note:'Other exact source.'})+importIt(id(62))+block(
 `begin insert into public.semantic_claim_relations(user_id,from_claim_id,to_claim_id,relation_type)values('${owner}',(select id from public.semantic_claims where source_message_lineage_id='${id(61)}'),(select id from public.semantic_claims where source_message_lineage_id='${id(62)}'),'corrects');exception when others then denied:=sqlerrm='ATTRIBUTED_SOURCE_EFFECTIVE_EDGE_FORBIDDEN';end;`+check('denied','effective edge accepted')));
run('exact owned target is returned without inventing supersession',ordinary()+ordinary({id:id(62),note:'Correction reports the exact first source.'})+
 importIt(id(61),{classification:'observation',target:null})+importIt(id(62),{classification:'attributed_correction',target:{kind:'source',id:id(61)}})+authenticated+
 block(check(`jsonb_array_length(${read}->'targets')=1`,'exact owned target missing')+check(`${read}#>>'{targets,0,id}'='${id(61)}'`,'wrong exact target'))+'reset role;');
const a=boundAppend(['Exact \u03b1\n\tcorrection wording.']),proposal=appendJobProposal(a.job,'Subject');proposal.items[0].semantics=semantics;
const job=validateAppendJob(proposal,{id:source(1).source,role:'user',text:a.text,createdAt:'2026-09-20T12:00:00Z'},[{id:pet,name:'Subject',user_id:owner}],owner);
run('canonical writer atomically stamps same-Brain semantics, exact body and durable receipt',turn(a.text)+mint({job})+block(
 `select * into r from ${execute()};`+check("r.changed and r.action->>'status'='succeeded'",'canonical write failed')+
 check(`(select (governance_metadata->>'sourceSemanticsPayload')::jsonb->'target' from public.semantic_claims where source_message_lineage_id=${row(1)})=${j(semantics.target)}`,'write meaning mutated')+
 check(`(select note from public.pet_care_entries where id=${row(1)})=${q(a.job.items[0].body.text)}`,'body changed')+
 `select * into replay from ${execute()};`+check('not replay.changed and replay.action=r.action','replay mutated')+
 check("(select count(*) from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload')=1",'replay added attribution')));
run('legacy job without supplied semantics remains unknown, never inferred from prose',append(['Correction means any arbitrary text.'])+block(
 check("(select (governance_metadata->>'sourceSemanticsPayload')::jsonb->>'classification' from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload')='unknown'",'legacy prose inferred')));
run('canonical replace stamps new version while retaining prior non-effective attribution',append(['Original body.'])+replace()+block(
 `select * into r from ${execute(2)};`+check("r.changed and r.action->>'status'='succeeded'",'replace failed')+
 check("(select count(*) from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload')=2",'replacement source versions lost')));
run('source message cleanup and owner deletion remain possible',append(['Exact note.'])+
 `delete from public.pet_care_entries where user_id='${owner}';delete from public.ask_conversation_messages where id='${source(1).source}';delete from auth.users where id='${owner}';`+
 block(check(`not exists(select 1 from public.semantic_claims where user_id='${owner}')`,'owner artifacts remain')));
