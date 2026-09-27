# Explicit source semantics import

Preparation and offline rehearsal only. No production data or provider was accessed.

1. Enumerate active care rows for one verified owner and owned subject using the existing server authority. Preserve exact body/title, ID, owner/pet, occurred/created/updated timestamps, intelligence source message ID and sourceSpanId. A partial export cannot be called a complete migration.
2. A reviewed interpretation supplies observation, attributed_correction, or unknown. An attributed target is exact owned source/claim, a half-open interval plus optional established canonical concept, or target_unknown. Never infer an effective edge. No regex or runtime classifier is permitted.
3. Construct source-semantics.v1 JSON with exactly version/source/classification/target. Keep this reviewed payload immutable and hash its exact UTF-8 bytes in the import audit.
4. Under the existing server/service boundary call public.import_ask_source_semantics(verified_owner_uuid, exact_payload_text). The private writer rechecks source ownership, version/body, target ownership and schema. The authenticated browser role cannot invoke this import.
5. Exact replay returns the same claim; conflicting same-version meaning fails SOURCE_SEMANTICS_REPLAY_MISMATCH. Source changes require a new exact source snapshot and review. Do not disable guards or rewrite an existing attributed claim.
6. Verify owned read_ask_source_semantics completeness and fresh snapshot agreement. Unknown or matching unlinked attribution still limits effective facts and arithmetic; import completion does not mean truth closure.
7. Retain the source export hash, reviewed payload hash, returned claim ID, owner/subject mapping, result and cleanup audit. Production preparation must avoid logging credentials or unrelated owners' content.

For a provider-assisted migration, source review and its cost/call authorization are a separate future task. No such tool is invoked here. A reviewed human/offline fixture interpretation is sufficient at this boundary; the SQL importer does not interpret language.

The seven frozen raw corpora are unchanged. reviewed-source-semantics.json and source-semantics-fixture.mjs are separate explicit test import artifacts. Their default observation declaration is fixture-author authority only and is never a production fallback. Individual adversarial fixtures explicitly override that declaration. Hashes are recorded in PHASE5_CORPUS_HASHES.json.

Rollout requirement: do not deploy the typed reader without this migration and a reviewed classification plan for all active legacy sources. Unmigrated sources deliberately make effective reads unavailable. This phase does not authorize production import, deployment, or any provider call.
