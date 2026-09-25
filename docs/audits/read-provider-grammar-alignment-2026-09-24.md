# Read provider grammar alignment — 2026-09-24

Base HEAD: 42f9e36b4cda82f006357ad9a38792088e8cc9db.
Preserves certified sufficient publication repair 9b8c2b93f913d882707e7da5c580d2f13b7a1a3e.

## Root cause and inventory
The broad legacy output enum admitted strategy/operation combinations already rejected by the Binder. No coercion, retry, second interpreter or new operation meaning is introduced.

| Family | Before / disposition |
|---|---|
| Selection plus strategy; selection plus probes | Already structurally impossible; retained |
| Finite chronological limit | Already provider-impossible; canonical selection retained |
| Endpoints | Now compare only, null selection and anchor |
| Event candidates | Now read only, nonempty predicates, null selection and anchor |
| Calendar samples | Now sufficient only; all four existing operations retained |
| Non-null strategy plus episode or probes | Now impossible; Binder already rejects these combinations |
| Selection plus episode or calendar | Now impossible; Binder already rejects these combinations |
| Ordinary null strategy | Retained, including bounded factual reads |
| Anchor iff read_since_event and anchor/calendar compatibility generally | Intentionally Binder-only outside the narrowed operation variants; avoids multiplying the entire contract |
| Dates/order, term validity, owned subjects and probe provenance | Binder/server authority; not expressible as static provider shape constraints |
| Ordinary episode referent/operation/predicate/hint/limit relationships | Intentionally Binder-only, outside bounded strategy normalization |
| Ordinary grounded needs with predicates/hints/limit/calendar/episode/anchor | Intentionally Binder-only after server grounding |
| Measurement/calendar/limit semantic check | Existing Binder check unchanged |

Reviewed read-ticket.ts, read-selection.ts, typed-read-ticket.ts, read-probes.ts, ask-request-contract.ts and interpret-ask.ts. Provider objects remain closed, required-field variants using anyOf and enum narrowing, with no if/then. One generic instruction explains legacy endpoints, ordinary bounded reads and preferred compositional selection. Binder and interpreter have no changes.

## Verification
33 new direct Ajv provider/parity checks, plus updated structural assertions. Focused schema/Binder/Ask/one-interpreter/direct-evidence: 145/145. Certified sufficient repair: 45/45. Focused publication/Labs/dispatch/selection: 189/189. Retrieval: 239/239.
G1 94/94; G2 89/89; G3A 89/89; G3C 74/74; retirement 5/5.
Brain 78/78; Body 188/188; Core 51/51; Publication 85/85; Profile 78/78; Mutations 184/184; Security 84/84.
Safety 54/56, exact known two only. Audit 209/222, exact known thirteen only. Groups overlap; counts are not summed.
Additional feature-provider-compatibility test failed at ASK_MEMORY_BRAIN_REQUIRED and reproduced against previous clean source; not a new grammar failure. Left unchanged and recorded separately.
Repository typecheck, clean dependency-verified build and clean typecheck pass. Whitespace and production anti-hardcoding checks pass. No production additions matching the prohibited names/measurement words.
See grammar-alignment-evidence-2026-09-24 for machine-readable gates and build results.

## Live acceptance
Pending the committed repair. Restored the isolated local stack with its previously applied 135-migration schema; all version IDs and local migration files match, no new migration replay was needed. Empty users verified before creating an equivalent synthetic fixture. Production cutover remains blocked.

Retest outcome: Case A reached legal interpretation and certified Lungs retrieval, then failed at publication eligibility. See read-provider-grammar-case-a-2026-09-24.md. Acceptance stopped and cleanup verified.
