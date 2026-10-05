-- SEPARATE slow native specification, UNEXECUTED. Actual expiry; no clock/row spoof.
-- Load fixture then this file in one rollback-only transaction. Two versions wait
-- together for the original 15-minute expiry, bounded to at most 905 seconds.
set local statement_timeout='920s';
do $$
declare f1 jsonb;f2 jsonb;c1 uuid;c2 uuid;wait_seconds numeric;r jsonb;before jsonb;
begin
 f1:=pg_temp.tv2_new_case()||'{"version":"1"}'::jsonb;c1:=pg_temp.tv2_mint_append(f1);
 f2:=pg_temp.tv2_new_case()||'{"version":"2"}'::jsonb;c2:=pg_temp.tv2_mint_append(f2);
 select greatest(0,extract(epoch from max(expires_at)-clock_timestamp()))+0.05 into wait_seconds from public.ask_action_capabilities where id in(c1,c2);
 perform pg_temp.tv2_check(wait_seconds between 0 and 905,'bounded genuine expiry wait');
 perform pg_sleep(wait_seconds::double precision);
 r:=pg_temp.tv2_confirm_append(f1,c1);perform pg_temp.tv2_check(not(r->>'changed')::boolean and r#>>'{action,status}'='failed' and r#>>'{action,errorMessage}'='That action expired before it was confirmed.','v1 actual expiry transition');
 r:=pg_temp.tv2_confirm_append(f2,c2);perform pg_temp.tv2_check(not(r->>'changed')::boolean and r#>>'{action,status}'='failed' and r#>>'{action,errorMessage}'='That action expired before it was confirmed.','v2 actual expiry transition');
 perform pg_temp.tv2_reject(f1,'{}','42501','CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN','v1 expired source');
 perform pg_temp.tv2_reject(f2,'{}','42501','CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN','v2 expired source');
 raise notice 'PASS actual expiry both retained task writers';
end $$;
