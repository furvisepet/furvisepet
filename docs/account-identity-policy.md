# Furvise account identity policy

Furvise ownership is keyed only by the verified Supabase Auth user UUID. Email is normalized by trimming and lowercasing before password authentication, but it is never used as an application ownership key.

Public signup remains non-enumerating. A sessionless signup response does not create `user_profiles`, pet profiles, onboarding drafts, or any other workspace record, and the UI does not claim that a workspace was created. It offers confirmation resend, sign in, and password reset recovery.

Google uses Supabase OAuth with PKCE and the validated `/auth/callback` return path. Provider-side verified-email linking is governed by Supabase Auth configuration. Furvise never merges application owners from an unverified email. When safe automatic linking is unavailable, a user must first sign in to the canonical account and use Account > Connected sign-in methods. `linkIdentity` is therefore only called from an authenticated session.

Duplicate reconciliation is audit-first. Auth users are never automatically deleted and ownership is never moved merely because two identities share an email. A merge requires proof that the user controls both identities and explicit selection of the canonical UUID.
