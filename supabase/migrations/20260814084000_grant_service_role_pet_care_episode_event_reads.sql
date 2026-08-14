-- The trusted account-export workflow reads every user-owned export table through
-- its server-only client. This lifecycle table was the sole table in that export
-- without the corresponding service-role read grant.
grant select on table public.pet_care_episode_events to service_role;
