begin;
do $$
declare
 u uuid := '77000000-0000-4000-8000-000000000001';
 f uuid := '77000000-0000-4000-8000-000000000002';
 ids uuid[] := array[]::uuid[]; r record; i integer; req uuid;
begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 (u,'brief-allowance@example.test',now(),false),(f,'brief-free@example.test',now(),false);
 insert into public.billing_accounts(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_currency,checkout_price_id,plan,subscription_status,current_period_start,current_period_end)
 values(u,'cus_briefquota','sub_briefquota','price_briefquota','usd','price_briefquota','plus','active',now()-interval '1 day',now()+interval '29 days');
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 if has_function_privilege('authenticated','public.reserve_ai_credit(uuid,uuid,uuid,text,text)','execute')
 or has_function_privilege('anon','public.get_my_vet_brief_allowance_status()','execute')
 then raise exception 'quota authority exposed'; end if;
 for i in 1..4 loop
  req:=gen_random_uuid(); ids:=array_append(ids,req);
  select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('a',64));
  if r.reservation_status<>'reserved' then raise exception 'brief % failed %',i,row_to_json(r);end if;
 end loop;
 req:=gen_random_uuid();
 select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 if r.reservation_status<>'limit_reached' then raise exception 'fifth in-flight brief admitted';end if;
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.remaining<>0 or r.allowance<>4 then raise exception 'in-flight usage incorrect %',row_to_json(r);end if;
 -- Replaying one request must not consume a fifth slot.
 select * into r from public.reserve_ai_credit(u,ids[1],ids[1],'vet_brief',repeat('a',64));
 if r.reservation_status<>'reserved' then raise exception 'replay changed';end if;
 perform public.set_ai_credit_disposition(u,ids[1],ids[1],'vet_brief',repeat('a',64),'release');
 perform public.release_ai_credit(u,ids[1],ids[1],'vet_brief',repeat('a',64));
 req:=gen_random_uuid();
 select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 if r.reservation_status<>'reserved' then raise exception 'failed brief not released';end if;
 for i in 2..4 loop
  perform public.set_ai_credit_disposition(u,ids[i],ids[i],'vet_brief',repeat('a',64),'complete');
  perform public.complete_ai_credit(u,ids[i],ids[i],'vet_brief',repeat('a',64));
 end loop;
 perform public.set_ai_credit_disposition(u,req,req,'vet_brief',repeat('a',64),'complete');
 perform public.complete_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.used<>4 or r.remaining<>0 then raise exception 'completed usage incorrect';end if;
 -- Dedicated quota cannot consume or block Ask/product allowances.
 req:=gen_random_uuid();select * into r from public.reserve_ai_credit(u,req,req,'ask',repeat('b',64));
 if r.reservation_status<>'reserved' then raise exception 'Ask blocked by briefs';end if;
 req:=gen_random_uuid();select * into r from public.reserve_ai_credit(u,req,req,'product_query',repeat('b',64));
 if r.reservation_status<>'reserved' or r.remaining<>500 then raise exception 'product allowance consumed by briefs';end if;
 req:=gen_random_uuid();select * into r from public.reserve_ai_credit(f,req,req,'vet_brief',repeat('a',64));
 if r.reservation_status<>'limit_reached' then raise exception 'Free admitted brief';end if;
 -- Server-resolved subscription boundary resets the separate allowance.
 update public.billing_accounts set current_period_start=now(),current_period_end=now()+interval '1 month' where user_id=u;
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.remaining<>4 then raise exception 'new billing period did not reset %',row_to_json(r);end if;
 -- Carry legacy calendar-bucket publications into the active period.
 insert into public.ai_usage_events(user_id,request_id,logical_request_id,feature,payload_hash,credits_used,status,period_start,allowance_period_key,settlement_disposition,settlement_decided_at,completed_at)
 values(u,gen_random_uuid(),gen_random_uuid(),'vet_brief',repeat('c',64),1,'completed',date_trunc('month',now())::date,null,'complete',now(),now());
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.remaining<>3 then raise exception 'legacy brief omitted from current allowance %',row_to_json(r);end if;
 for i in 1..3 loop
 req:=gen_random_uuid();select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('d',64));
 if r.reservation_status<>'reserved' then raise exception 'legacy carryover blocked too early';end if;
 end loop;
 req:=gen_random_uuid();select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('d',64));
 if r.reservation_status<>'limit_reached' then raise exception 'legacy carryover bypassed cap';end if;
 perform set_config('request.jwt.claim.sub',f::text,true);
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.used<>0 or r.allowance<>0 then raise exception 'cross-account usage leaked';end if;
end;
$$;
rollback;
