begin;
drop function public.read_ask_episode_sources(uuid,text[],uuid[]);
drop function public.read_ask_episode_references(uuid);
drop index public.ask_episode_topic_start_idx;
drop index public.ask_episode_member_scope_idx;
drop index public.ask_displayed_episode_refs_idx;
-- Keep existing response envelopes as historical references; the reverted app
-- does not consume them. No source rows or prior migration objects are removed.
notify pgrst,'reload schema';
commit;
