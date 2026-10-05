-- Run under existing disposable schema owner, after candidate migration.
-- Temporarily restores captured definitions ONLY in rollback subtransactions to
-- test exact-body/absent-V2 preconditions. No grants or role definitions changed.
create function pg_temp.task_catalog() returns jsonb language sql as $$
 select coalesce(jsonb_object_agg(p.oid::text,to_jsonb(p)||jsonb_build_object('proargdefaults',pg_get_expr(p.proargdefaults,0))),'{}') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')
$$;
do $$
declare records jsonb:=current_setting('furvise.task_preimages')::jsonb;migration text:=current_setting('furvise.task_migration');
 item jsonb;before_catalog jsonb;after_catalog jsonb;expected_catalog jsonb;installed_catalog jsonb:=pg_temp.task_catalog();
 fn oid;code text;msg text;rejected boolean;body text;defs jsonb:='{}';
begin
 for item in select * from jsonb_array_elements(records)loop
  fn:=to_regprocedure(item->>'signature');perform pg_temp.tv2_check(fn is not null,'both real signatures present');
  perform pg_temp.tv2_check(encode(sha256(convert_to((select prosrc from pg_proc where oid=fn),'UTF8')),'hex')=item->>'afterBodySHA256','exact proposed body installed');
  perform pg_temp.tv2_check((select prosecdef and pg_get_userbyid(proowner)='postgres' and proconfig=array['search_path=""'] and provolatile='v' from pg_proc where oid=fn),'owner/security/search path unchanged');
  perform pg_temp.tv2_check(has_function_privilege('service_role',fn,'EXECUTE') and not has_function_privilege('anon',fn,'EXECUTE') and not has_function_privilege('authenticated',fn,'EXECUTE'),'effective service-only ACL unchanged');
  defs:=defs||jsonb_build_object(fn::text,pg_get_functiondef(fn));
 end loop;
 begin
  for item in select * from jsonb_array_elements(records)loop execute item->>'before';end loop;
  before_catalog:=pg_temp.task_catalog();expected_catalog:=before_catalog;
  for item in select * from jsonb_array_elements(records)loop
   fn:=to_regprocedure(item->>'signature');expected_catalog:=jsonb_set(expected_catalog,array[fn::text,'prosrc'],to_jsonb(item->>'afterBody'));
  end loop;
  execute migration;after_catalog:=pg_temp.task_catalog();
  perform pg_temp.tv2_check(after_catalog=expected_catalog,'only two exact bodies change, every catalog attribute/default/grant stable');
  raise exception using errcode='Z0001',message='rollback catalog positive';
 exception when sqlstate 'Z0001' then null;end;
 perform pg_temp.tv2_check(pg_temp.task_catalog()=installed_catalog,'catalog positive rollback exact');
 begin
  execute 'drop function public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)';
  before_catalog:=pg_temp.task_catalog();rejected:=false;
  begin execute migration;exception when others then rejected:=true;get stacked diagnostics code=returned_sqlstate,msg=message_text;end;
  perform pg_temp.tv2_check(rejected and code='P0001' and msg='TASK_WRITER_REQUIRED_SIGNATURE_MISSING: public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)','absent V2 explicitly unavailable and aborts');
  perform pg_temp.tv2_check(pg_temp.task_catalog()=before_catalog,'absent V2 no partial patch or invented function');
  raise exception using errcode='Z0001',message='rollback absent V2';
 exception when sqlstate 'Z0001' then null;end;
 begin
  for item in select * from jsonb_array_elements(records)loop
   body:=item->>'before';if item->>'name'='apply_ask_task_v2' then body:=replace(body,'declare v_task','-- unknown source drift'||chr(10)||'declare v_task');end if;execute body;
  end loop;
  before_catalog:=pg_temp.task_catalog();rejected:=false;
  begin execute migration;exception when others then rejected:=true;get stacked diagnostics code=returned_sqlstate,msg=message_text;end;
  perform pg_temp.tv2_check(rejected and code='P0001' and msg='TASK_WRITER_EXACT_SOURCE_OR_SECURITY_PRECONDITION: public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)','unmatched V2 rejected exactly');
  perform pg_temp.tv2_check(pg_temp.task_catalog()=before_catalog,'unmatched second body rolls back first patch');
  raise exception using errcode='Z0001',message='rollback unmatched V2';
 exception when sqlstate 'Z0001' then null;end;
 perform pg_temp.tv2_check(pg_temp.task_catalog()=installed_catalog,'all precondition fixtures restore exact catalog');
 raise notice 'PASS task writer catalog equality, absent V2, unknown V2';
end $$;
