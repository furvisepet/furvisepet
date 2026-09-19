-- Run as postgres after disabling/reverting the application RPC integration.
-- If application is still using it, reads become explicitly unavailable.
-- No source data or prior correction objects are removed.
begin;
set local role ask_history_candidate_reader;
drop function public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer);
reset role;
drop function public.ask_history_request_owner();
revoke select on public.dog_profiles,public.pet_care_entries from ask_history_candidate_reader;
revoke usage on schema public from ask_history_candidate_reader;
revoke ask_history_candidate_reader from postgres;
drop role ask_history_candidate_reader;
notify pgrst, 'reload schema';
commit;
