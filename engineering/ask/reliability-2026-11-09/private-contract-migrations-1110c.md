# Retained authority and read-only public contract checkpoint

Production code, dependencies, workflows, test launcher and bootstrap are unchanged. The public Ask engine still exposes only read_pet_profile and search_saved_records, binds actual authenticated owner/pet scope server-side, validates evidence and citations and admits at most two physical provider calls. No public mutation feature is introduced.

## Independent completed baseline

[Run42752423586](https://github.com/furvisepet/furvisepet/actions/runs/42752423586), exact7bde1502c7fcd39087d12f9008ac8dccb36bd910: **6258 total /6198 pass /59 fail /0 cancelled /1 optional skip**. The prior d0a0 run had the same6258 total and93 failures. No case-count reduction is used as a gate.

Ask contract763 passes/1 optional skip, database contract, security, lint, TypeScript, production audit and production build passed. Verify failed only at Full tests. Checkout3c941ffd73c73367645f4a3b71293647e95cda25 tree15f6d6b7bbf742ee7bf2738a63bf7b88a48bf355 exactly equals head. Raw verify log SHA256210e47ad5aa3da79a8fc74f660674aca621e8e557b7637be4094e946f9f0d637. All59 detailed failure blocks are retained in full-failure-index-7bde-1110c.json; they are not waived. Full tests took1906.499s. Observed aggregate job wall time2221s is not an invoice or remaining-minutes claim.

All13 wire admission/archived ABI cases passed individually on this exact Linux source, including all8 context combinations and the262-vector ABI test. The local Windows0xC0000005 remains separately evidenced; it was not hidden by deleting cases, adding skips or shipping jitless.

## Concrete migrations and mock correction

- Public REMOVE, replacement, lifecycle and confirmation tests exercise or assert the closed real public handlers. Unsupported actions cannot execute or survive as false success prose. All retained private source-span, owner, target, freshness, receipt and confirmation assertions remain.
- Private recent-authentication tests now call the private capability function directly, while independently requiring public404/no RPC. They do not manufacture an enabled public writer. Fresh auth, missing/stale/foreign auth, cancellation, receipt replay after parent removal and tampering remain covered.
- A stricter cancellation assertion exposed a faulty mock in tests/helpers/canonical-replace.mjs: it returned succeeded/changed:true for cancel. The mock now follows the existing SQL cancellation branch: cancelled receipt, changed:false and stable terminal replay. A confirm after cancellation cannot turn the receipt into a successful write. Actual SQL and the existing receipt verifier already supported cancelled; neither production implementation changed.
- Provider-schema positive REMOVE fixtures supply required draftAnswer:null; mixed read/mutation negatives assert the actual earlier domain guard. No guard was broadened or disabled.
- General conversation carrying lifecycle authority fails closed. The private active-subject requirement is separately bound to explicit owned pet IDs; unknown IDs fail and a deceased-profile conflict performs no action.
- Residual-requirement schema inspection selects actual mode:read branches, excluding clarification/mixed alternatives. It still checks exactly two read variants and the original residual bounds.
- Confirmed-temporal-scope ordering still requires parsing, immutable payload hashing and rejection before persisted-request/provider access, using the current native orchestration boundary.
- Grief/emergency, credit settlement and false-action tests use the current native path. The confirmed-loss emergency exemption, medical uncertainty policy and retained private SQL locking/service-role/confirmation controls remain asserted. A scripted stellar-lifecycle question uses general conversation with zero record reads and two admitted SDK calls. Scripted responses are not live model accuracy.
- Corrected UTF-8 serialization of the engineering document's replay excerpt. The saved record and rendered application quote were already unchanged.

## Actual local receipts

Retained11-file cohort: **228/228**,0 skips,42.58s; SHA25622e48cbaa5a202f45c608ed51cb7798d9e529fed4edae1d240ab46fad4d3cdde.
Grief/emergency/credit cohort: **64/64**,0 skips,3.44s; SHA2565f61dfbd5bca62b1bc345cd9c1574941772b222549a455753d14a7c59ec05d99.

Fresh checkpoint gates:764 total /763 focused passes /0 failures /1 existing optional skip; security517/517; uncached types, full lint, production audit(0 vulnerabilities), production build all passed. Exact timings, source pins and raw log hashes are in qualification-1110c.json. These cohorts overlap other gates and are not a summed scenario count. Initial47/49 and48/49 fixture failures are preserved in the Windows evidence directory.

## Authenticated preview and costs

On the exact7bde READY preview dpl_5YgZ2FU7dBtinBkxUJueXaiwYc9C, a fresh navigation and normal Conversations selection replayed the original saved note:
> The saved note says: "Furvise QA persistence test LG-20261026 — synthetic, not medical data. Baseline alpha."

The UI displayed event Oct26,2026 02:05:00AM PDT and recorded02:06:38AM PDT. Final DOM read was untruncated; composer empty. This was replay, not new generation or an independently observed citation-expansion HTTP200. It does not establish new-candidate generation acceptance.

New paid calls this continuation:0 turns /0 physical calls /$0. The prior16-turn/$0.062993 budget remains closed; a new12-turn/$0.10 cap is unapproved. No credentials or browser cookies were exported.

## Release gate

NO-GO. The59-failure full result belongs to7bde, before this pending test-only checkpoint. Targeted passes must not be subtracted and presented as a new measured full result. Run the exact candidate unfiltered in Linux, retain remaining failures and continue genuine migrations. Fresh authenticated generation, independent source-owner/privacy review and remaining monitoring/device qualifications are still open. Keep PR516 draft; no self-approval, production promotion, merge, SQL or branch-protection change. Ops517 remains separate/unmerged. Rollback is a review-branch revert or stopping preview use; no database rollback.
