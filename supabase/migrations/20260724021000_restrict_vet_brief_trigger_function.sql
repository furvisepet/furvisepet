-- Supabase project default privileges grant newly-created functions directly
-- to API roles. This trigger function is internal and is never an RPC surface.
revoke all on function public.vet_visit_briefs_validate_ownership()
from public, anon, authenticated;
