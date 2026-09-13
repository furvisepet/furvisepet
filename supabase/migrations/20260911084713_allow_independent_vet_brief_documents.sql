-- A new visit creates a new document at version 1. Versions are relative to
-- previous_version_id, not a single counter shared by every document for a pet.
-- Keep immutable fields, owner/pet/source validation, the primary key and the
-- owner/idempotency uniqueness boundary unchanged.
drop index public.vet_visit_briefs_owner_pet_version_idx;
create index vet_visit_briefs_owner_pet_version_idx
  on public.vet_visit_briefs(user_id, pet_profile_id, version);
