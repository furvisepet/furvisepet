# Native subjects, read-domain and retained timestamp contracts

Test/evidence checkpoint based on 3a77dda0d35f9ae389a4f6f2609d7b1e8741b736. Application code, dependencies, workflows, launcher and bootstrap are unchanged. Public Ask remains read-only with two physical calls and a 2400-token output cap. No public mutation authority was restored.

## Completed Linux baseline

Run [42757933787](https://github.com/furvisepet/furvisepet/actions/runs/42757933787), exact 3a77: **6258 tests /6221 pass /36 fail /1 skip**. All 36 failed outcomes are indexed in full-failure-index-3a77-1110d.json. Checkout a836986434baaeda39f7ae1c1a2999b66ea99e55 has the exact head tree aea465504a1f26efc3efaa98353daa47ca72f03d. Raw verify-log SHA256 c4c3f68992e7ad5e7381053218141f7b4d258cd6cf68469b21217393e530a8bc.

Ask contract/database, lint, types, security, production audit/build passed. Only Full tests failed. This result is independent of the new test changes below. Targeted passes are not subtracted from it to invent a new full-suite count.

## Concrete migrations

- Native owned-handle reads admit the independent owned pet while excluding foreign profiles. Foreign, concrete foreign-ID and invented handles fail before any DB read. Retained private selected-pet guard assertions remain.
- Retained ambiguity/long-form resolver cases remain intact. The real public POST and native SDK fixtures now prove clarification presentation, no reads/writes, released clarification credit, successful answer completion, one user-message identity and durable assistant finalization. Provider responses are scripted; these are orchestration tests, not live model subject-resolution accuracy.
- Private read parsing keeps a clean positive witness and rejects frame, mutation, task and write carriers individually and together. Each rejection preserves the input and consumes only its initial mock callback.
- Evidence-domain rejection asserts its actual earlier structured diagnostic, one-call failure, unchanged proposal and absence of private ticket terms in info/warn logs. Existing detailed ticket diagnostics remain.
- Timestamp ABI checks use the hash-verified historical schema archive with all262 original vectors. Actual admitted-parser checks separately compile the current source-window schema and use current evidenceContext field aliases/native ticket shape, with all six temporal leaves retained.
- Malformed dates remain rejected before catalog capability/hydration. A single bounded structural repair uses the second admitted callback; malformed repair terminates with ASK_INTERPRETATION_REPAIR_JSON. Mock assertion failures are independently rethrown, so a wrong mock request cannot masquerade as expected parser rejection.
- Admission tests require exactly two allowed reservations, deny all later legacy phase labels, require the current25800-microdollar reservation, and prove an8192-output request is denied without consuming an allowed call. No runtime cap changed.
- Three existing unused-variable warnings in the touched diagnostics test were removed by equivalent object-copy/delete operations.

## Actual qualification

Final exact-source six-file cohort: **65/65**, zero skips,100.15s; raw SHA256 1d1b4e97cdef3d26838804bd6a6ab90cc3919471bd58f6188f1bee4f99fb4cef. Zero-warning changed-file lint passed in6.48s; diff check passed. The existing repository runner/bootstrap was used unchanged.

An earlier65/65 receipt and the later63/65 encoding-edit failure are both retained. The latter was caused by a Windows default-codepage file read and was repaired before qualification. Original non-ASCII character counts match Git across every changed file. No assertion was weakened for those failures. Earlier schema/transport failures and Windows native crashes also remain in the local evidence directory; no test deletion, skip or runner rule hides them.

No new provider/network generation: **0 paid turns /0 paid physical calls /$0**. The prior paid budget remains closed. No merge, production promotion, database mutation or Ops517 change.

## Remaining gates

NO-GO. This candidate needs its own unfiltered Linux CI. The36-failure baseline must remain visible until genuine further migration or code repair. Fresh paid generation, independent source-owner/privacy review, authenticated cross-owner penetration and remaining monitoring/device checks remain open. PR516 stays draft; no self-approval.
