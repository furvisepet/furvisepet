begin;
do $$
declare
 u uuid:='78000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); r record; initial_key text;
begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(u,'free-brief@example.test',now(),false);
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 if not public.has_vet_brief_entitlement() then raise exception 'Free cannot open/save/print trial';end if;
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.allowance<>1 or r.remaining<>1 then raise exception 'Free initial allowance incorrect';end if;
 select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 if r.reservation_status<>'reserved' then raise exception 'Free first reservation failed';end if;
 select * into r from public.reserve_ai_credit(u,other,other,'vet_brief',repeat('a',64));
 if r.reservation_status<>'limit_reached' then raise exception 'simultaneous Free attempt admitted';end if;
 perform public.set_ai_credit_disposition(u,req,req,'vet_brief',repeat('a',64),'release');
 perform public.release_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 req:=gen_random_uuid();
 select * into r from public.reserve_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 if r.reservation_status<>'reserved' then raise exception 'failure burned trial';end if;
 perform public.set_ai_credit_disposition(u,req,req,'vet_brief',repeat('a',64),'complete');
 perform public.complete_ai_credit(u,req,req,'vet_brief',repeat('a',64));
 select allowance_period_key into initial_key from public.ai_usage_events where user_id=u and request_id=req;
 if initial_key<>'free:vet_brief:lifetime' then raise exception 'trial has resetting period';end if;
 if not public.has_vet_brief_entitlement() then raise exception 'consumed trial cannot reopen/export';end if;
 -- Upgrading creates paid monthly allowance, never resets the lifetime ledger.
 insert into public.billing_accounts(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_currency,checkout_price_id,plan,subscription_status,current_period_start,current_period_end)
 values(u,'cus_freetrial','sub_freetrial','price_freetrial','usd','price_freetrial','plus','active',now()-interval '1 day',now()+interval '29 days');
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.allowance<>4 or r.remaining<>4 then raise exception 'free use consumed paid quota';end if;
 update public.billing_accounts set plan='free',subscription_status='canceled' where user_id=u;
 select * into r from public.get_my_vet_brief_allowance_status();
 if r.allowance<>1 or r.remaining<>0 then raise exception 'downgrade reset lifetime trial';end if;
 other:=gen_random_uuid();select * into r from public.reserve_ai_credit(u,other,other,'vet_brief',repeat('a',64));
 if r.reservation_status<>'limit_reached' then raise exception 'second lifetime generation admitted';end if;
 -- No caller-controlled plan, date, pet or count can reset this key.
 if exists(select 1 from public.ai_usage_events where user_id=u and feature='vet_brief' and status='completed' and allowance_period_key<>initial_key) then raise exception 'identity changed';end if;
 update auth.users set email_confirmed_at=null where id=u;
 if public.has_vet_brief_entitlement() then raise exception 'unconfirmed email retained trial access';end if;
end;
$$;
rollback;

-- Exercise actual authenticated RLS, rather than only SECURITY DEFINER helpers.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('79000000-0000-4000-8000-000000000001','trial-rls-owner@example.test',now(),false),
 ('79000000-0000-4000-8000-000000000002','trial-rls-other@example.test',now(),false);
insert into public.dog_profiles(id,user_id,name) values
 ('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000001','Trial RLS Pet'),
 ('79000000-0000-4000-8000-000000000004','79000000-0000-4000-8000-000000000002','Other RLS Pet');
select set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into public.vet_visit_briefs(id,user_id,pet_profile_id,date_range_start,date_range_end,confirmed_title,confirmed_data)
 values('79000000-0000-4000-8000-000000000005','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000003',current_date,current_date,'Free trial access fixture','{}');
do $$
begin
 if (select count(*) from public.vet_visit_briefs where id='79000000-0000-4000-8000-000000000005')<>1 then raise exception 'Free cannot read saved own brief';end if;
 begin
 insert into public.vet_visit_briefs(user_id,pet_profile_id,date_range_start,date_range_end,confirmed_title,confirmed_data)
 values('79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000004',current_date,current_date,'Forbidden cross-owner fixture','{}');
 raise exception 'Free cross-owner write admitted';
 exception when insufficient_privilege then null;end;
end;
$$;
select set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000002',true);
do $$
begin
 if exists(select 1 from public.vet_visit_briefs where id='79000000-0000-4000-8000-000000000005') then raise exception 'Free cross-owner read leaked';end if;
end;
$$;
rollback;
