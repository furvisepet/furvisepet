# Profile/current-state factual-authority decomposition

Base: `fbb78379a1fe816a2bdd5e959a624e71a939eabb`.
Scope: source inspection and offline characterization only. No application behavior, schema, publication policy, writes, deployment, or live requests changed.

## Verdict and evidence levels

A generic owned-field projection is justified. Profile weight is one numeric subtype; species, sex and reported breed require the same source-domain, subject, field and snapshot binding. A separate persisted profile certificate or profile-weight truth store is unnecessary.

The current implementation does **not** universally provide this authority. It has owner-scoped typed storage and source eligibility, but standalone saved-profile answers still use context selection and existing-policy model review. Certificate-derived publication authority is gated on historical selection receipts.

Below, **runtime** means executable enforcement, **guidance** means provider/reviewer instructions, **characterization** means an offline test of existing behavior, and **proposal** means unimplemented design. Static callers establish repository reachability, not production traffic or deployed database contents.

## Active route inventory

| Route and concrete boundary | Binding / representation | Publication and authority today | Classification |
| --- | --- | --- | --- |
| Ask route: `app/api/ask/route.ts` ? `intelligence/planning-context.ts` ? request interpretation/binding in `ask-request-contract.ts` | Initial owner query through `ask-profile-read.ts::readAskProfiles` loads pet identity, species/lifecycle/sex; Brain supplies semantic subject intent and `evidenceBasis/profileFields`; contract validates against owned pets and grounded conversation references | Establishes allowed subject/domain intent, not field-value certification | A: owned typed input; suitable for F: common migration |
| `intelligence/retrieve-context.ts` ? `run-intelligence.ts::runFurviseIntelligence` | Owner/pet-scoped full profile queries; generation receives resolved read-pet profiles. `ask-evidence.ts::createAskEvidenceContract` intersects authority with eligible owned IDs | Saved-profile evidence catalog excludes nonprofile source types. Loading a row alone does not authorize another pet's source | A/B |
| `ai/ask-reasoning.ts::buildContextRecords/buildAskContext` | Constructs `profile:<petId>:<field>` text records from stored values. Requested fields **or raw-question field matching** can include fields; ordinary profile context is then ranked/budgeted | No generic immutable typed-field proof. Strings/units/defaults become represented source text | B/C |
| `ask-evidence.ts::eligibleAnswerSources` | Requires authorized pet, loaded source, represented span and acceptable loss/status; profile source must map to a loaded profile | Standalone profile source may be citeable without a profile-obligation-specific binding. This is eligibility, not field snapshot certification | B |
| `publication-authority.ts::derivePublicationAuthority` and `publicationSources` | Early return without ticket selection/history ticket coverage; requires qualifying certified selection receipt. Companion profileFields then get exact profile IDs | Companion profile obligations are `existing_policy/not_certified`, no certificate or certifiedRecordIds. Certified history obligations cannot substitute profile sources. Pure saved-profile requests do not receive this derived authority | B/D; partially integrated |
| Generation ? `finalize-ask-answer.ts` ? historical review/repair and `validation/validate-answer.ts::validateGeneratedAnswer` | Uses represented eligible source text; certified authority filtering applies where derived authority exists | Standalone profile answers remain model-assisted with source/citation/numeric/claim checks. Reviewer policy distinguishes profile current state from dated history; this is not equivalent to a deterministic typed-field certificate | D |
| `read-projection.ts::deterministicReadProjection` via finalization | Source-free limitations remain allowed. Ticketed requests return before legacy factual projection. Non-ticket historical/current-weight comparison uses profile text, historical measurements, question/quote matching and output format | Can return server projection without new field proof; trusted-projection validator checks source eligibility, calculations and exact output contract. No universal profile renderer | C/E |
| `labs-list.ts::buildLabsList` | Requires ticketed historical read/coverage and constructs care-record Labs | Pure profile requests are outside this deterministic historical Labs path | Gap, F candidate |
| Pet profile page ? owner-scoped profile loader ? `pet-profile-file.ts::buildPetProfileFactRows` | Direct stored row rendered as UI fields; no Brain or history substitution | Valid display path, but not an Ask obligation certificate. Numeric display rounds to one decimal | A, presentation-only outside Ask |
| `pet-state/types.ts`, `retrieve-context.ts`, `run-intelligence.ts::currentStateMemories`, `safety-state.ts` | Separate derived state JSON with source_event_ids, state_version, computed_at, valid_through; history-access filtering applies | May influence context/safety, not equivalent to profile facts. Current-state memories are withheld when askHistory exists; remembered/current-state context is not an eligible direct answer source | Separate derived-state future authority |
| `app/api/vet-briefs/draft/route.ts` ? `vet-brief/prepare.ts`, builder/evidence/review/repair | Owned profile feeds server-owned immutable brief profile; evidence includes profile and bounded effective history | Separate Brief generation/review contract, not Ask Labs field authority | Separate future migration |

A historical ticket and explicit profile state are different source domains. Runtime saved-profile validation forbids historical dates, quantities, independent evidenceNeeds, episode/frame structures and requires profileFields. Historical selection certificates authorize their care events; profile presence in context is not permission to satisfy that obligation.

## Persisted field inventory

Storage reference: `app/lib/supabase.ts::DogProfileRow`; mutation normalization: `pet-profile-api-server.ts::saveProfile/buildPayload`; source projection: `ai/ask-reasoning.ts::buildContextRecords`.

All mutable values below inherit row-level `updated_at`, not a per-field measurement timestamp/version. Nullable types do not prove never-set versus deliberately-cleared.

| Stored field(s) | Meaning and type | Null/unit/precision and inference boundary |
| --- | --- | --- |
| name | Direct saved string label | Identity label, not inferred biological fact; save validates name |
| species | Typed reported dog/cat value | Nullable legacy storage; saved enum is deterministic |
| sex | Typed reported female/male/not_sure | Null and explicit not_sure differ; not_sure is not a known biological value |
| breed | Owner-reported free-text breed label | Can repeat stored label; cannot certify genetics or normalize mixed breeds by inference |
| weight_value + weight_unit | Numeric reported body weight plus unit | Raw value 4.71 kg is available. No measurement date. Current Ask text defaults missing unit to lb; future scalar proof must not silently inherit this guess |
| age_value + age_unit | Approximate/reported age | Mutable age, not date of birth or continuously recalculated age. Current text defaults missing unit to years |
| current_food | Free-text reported current food | Verbatim saved report; cannot infer ingredients, calories or feeding quantity |
| main_concern | Free-text owner concern | Reported concern, not diagnosis |
| routine_note | Free-text routine | Persisted/profile-page visible; not a current Ask profileFields selector |
| wellness_goal | Preference/configuration | Ask alias care_goal; not an achieved health outcome |
| avoid_ingredients | Nullable array of reported avoid preferences | Ask alias avoid. Empty list and null can differ in input intent, but text projection collapses empty joined text into not-recorded. Not proof of no allergies |
| monthly_budget | Numeric configuration | Saved budget, not expenditure or medical fact; currency is not established by this scalar alone |
| lifecycle_status | Active/deceased/archived enum | Lifecycle intent and visibility; no inferred diagnosis/cause |
| lifecycle_changed_at, deceased_at | Lifecycle metadata | Separate transition/audit semantics; not a general clinical event timestamp |
| id, user_id | Source identity/ownership | Server-owned authority, not model-created |
| created_at, updated_at | Row timestamps | Row creation/update, not timestamp of each fact or physiological observation |

No persisted birth-date, pronouns or gender column was found in the inspected DogProfileRow/migrations. Yet provider profileFields includes pronouns and context uses optional pronouns/gender reads. This is representation drift, not evidence those facts exist. Context exposes deceased_at although it is not in the provider field selector enum.

Field vocabulary also differs: provider `avoid`, stored `avoid_ingredients`, represented source kind `avoid_ingredients`. Companion authority constructs exact `profile:<pet>:<field>` IDs and common-history field filtering compares kinds directly. Thus an `avoid` selector need not bind the represented `avoid_ingredients` source. Do not treat aliases as already canonicalized everywhere.

## Ownership and source-domain boundary

Runtime chain:
1. `app/api/ask/route.ts` queries profiles with owner filter and optional requested pet filter; archived scope is constrained.
2. `ask-request-contract.ts` validates interpreted pet names/scope, selected-pet constraints and conversation references against authorized inputs.
3. `retrieve-context.ts` reloads full profiles with owner/id scope.
4. `runFurviseIntelligence` restricts profiles to resolved readPetIds.
5. `createAskEvidenceContract/eligibleAnswerSources` enforce owned authorized IDs and loaded/represented source provenance.

The provider's `evidenceBasis=saved_profile` versus `saved_history` is the existing semantic distinction. Guidance says profile means stored current fields; it does not authorize history substitution. Runtime domain checks and source filtering support that distinction. However raw-English compatibility branches and below-Brain profile field expansion remain; the system is not yet purely typed end-to-end.

## Snapshot, current, and missing values

**Current should mean the saved profile snapshot read for this request**, not latest physiology or latest care history. No automatic reconciliation from newer history into profile weight was found. A newer profile row timestamp can reflect an unrelated field edit.

`buildContextRecords` retains raw numeric text (4.71 kg), sets profile context `createdAt` from row updated_at, and has no occurredAt measurement timestamp. Source IDs remain the same across edits. Existing text spans identify what the model saw, but do not themselves establish a versioned typed snapshot.

`pet-profile-file.ts::formatNumber` rounds UI numeric display to one decimal. Future arithmetic must use stored 4.71, never parse displayed 4.7. SQL numeric converted to JavaScript number does not preserve original textual decimal scale/significant-digit metadata.

Existing null handling:
- Present value: emit represented field text.
- Loaded null/empty requested field: emits ?Not recorded in the current profile (empty field).?
- Property omitted/unavailable: no corresponding fact row.
- Explicit enum not_sure: stored unknown, distinct from confirmed known value.
- Cleared versus never-set: generally not recoverable from current row alone.
- Profile save can normalize unknown text to null and none-known avoid input to []; absence of a list is not proof of no allergy.
- Row/source failure: no authority to manufacture a value.

A null field can justify a scoped statement about the saved field if the row/field was actually read. It cannot justify ?the pet has no weight,? historical absence, or a guess from another source.

## Raw-English and publication gaps

Concrete below-Brain dependencies:
- `buildContextRecords`: matches original question against profile field names in addition to profileFields. The new test holds fields=[species] fixed and adds ?breed? to wording; represented breed appears.
- `buildAskContext`: outside common-history entry, question terms/scoreRecord and context budgets rank/select records. Profile field representation remains question-sensitive.
- `ask-request-contract.ts` legacy normalization: requestsSavedRecordLookup/current-message classification can move basis to history; past-present comparison/weight checks can add profile weight intent. These compatibility paths must not be mistaken for Brain-only semantic interpretation.
- `deterministicReadProjection`: protected non-ticket profile/history comparison depends on question weight/change/quote matching, profileFields, temporalScope and prose/default format.
- Generation/review consume original question for semantic support under existing policy; no universal deterministic obligation?typed profile-field binding exists.

The characterization test proves table/prose does not change profile records at **context construction**. It does not prove universal format independence: the legacy comparison projection has a format gate.

`derivePublicationAuthority` answers the central question: pure saved-profile sources remain outside its selection-derived binding. When profile fields accompany certified historical selection, each gets an existing-policy obligation, while historical obligations stay certificate-bound. Exact numeric/date comparison against certified history is stronger than the companion-profile existing-policy branch.

No claim is made that the present model review is unguarded: source eligibility, exact citations, numeric/claim validation, action-state guards and review/repair still run. The gap is that those safeguards are not a generic typed-field snapshot proof.

## Conflict counterexamples and permissible answers

| Stored conflict | Explicit saved-profile obligation | Explicit historical obligation | Ambiguous ?what does Milo weigh?? |
| --- | --- | --- | --- |
| Profile 4.8 kg; certified care event 4.71 kg | Saved profile says 4.8 kg; do not call it measured today | Use authorized care event, not 4.8 profile substitute; prose scalar extraction still needs its own authority | Brain must choose/clarify domain; no downstream winner heuristic |
| Profile breed X; old history prose Y | Report saved breed label X as reported | Quote/describe authorized historical report Y with provenance, not reconcile genetics | Resolve domain/intent upstream |
| Profile row updated after history | Same profile-domain answer; row update is not weight measurement date | Same history-domain answer | No timestamp tie-break between domains |
| History/correction updated after profile | Do not auto-overwrite saved profile answer | Resolve effective history for history obligation | No automatic ?newer source wins? |
| Profile value absent; history has value | Specific saved-field limitation; offer separately identified history only if requested/authorized | Historical obligation may still succeed | Do not silently fill profile from history |

These are domain distinctions, not new topic-specific rules. Profile breed/species/sex and numeric fields follow the same source binding.

## Writes and unconfirmed state

Active profile editor:
`app/api/pets/route.ts` / `app/api/pets/[id]/route.ts` ? `pet-profile-api-server.ts::saveProfile`.
It authenticates, validates bounded input, scopes existing profile by owner, applies normalized payload, uses idempotency controls and returns the committed row. Current profile authority can derive from that returned/reloaded row; a proposal cannot replace it. There is no generic immutable per-field fact receipt.

Lifecycle changes have separate status/timestamp rules and `pet_profile_lifecycle_events` audit support in tracked migrations. These do not create measurement-time provenance for ordinary profile fields.

Active Ask actions use `application-actions/capabilities.ts::createActionCapabilities/executeActionCapability` and `app/api/ask/actions/[messageId]/route.ts`, with server-bound action, ownership, authorization, RPC execution and persisted status/receipt. Pending/failed/proposed state is not mutation success.

Important reachability distinction: `application-actions/executor.ts::executeFurviseApplicationAction/updateProfile` is dormant in the inspected application graph (only same-file references). It must not be counted as a live Ask profile update executor. The tracked `execute_ask_action_capability` SQL implementation in `20260912042534_authorize_ask_actions_by_validated_turn_subject.sql` supports lifecycle/care/concern operations but has no general profile-field update branch; unsupported actions fail. Policy/proposal vocabulary alone does not prove mutation support. This is repository analysis, not a live database check.

`memory-policy.ts` rejects profile updates as requiring explicit editing. Publication's unverified-state checks and action receipts restrict success claims. There is no runtime path here that treats an unconfirmed model proposal as a loaded committed profile snapshot; model prose still requires the existing validation/review safeguards. Do not infer that every possible hallucinated mutation sentence is thereby mathematically impossible.

## Derived current-state and Vet Brief remain separate

`pet-state/types.ts` includes source_event_ids, state_version, computed_at and valid_through with per-domain status/confidence/source information. These are derived history projections, not direct editable profile fields. `currentStateMemories` packages state/version/source metadata as context only when askHistory is absent. `eligibleAnswerSources` excludes remembered/current-state context as direct fact support; safety-state consumes it separately. The wrapper itself does not establish generic freshness proof from valid_through. Future state authority needs its actual source/effective-history/freshness contract, not a direct-field shortcut.

Vet Brief loads an owned profile, builds immutable server profile material, and gives that plus evidence to its separate generation/review/repair. It can describe saved profile measurements without a measurement date, while dated history stays distinct. Do not use Brief's current policy as the common Ask contract or change Brief in this migration.

## Minimal future integration (proposal, not implemented)

Prefer an ephemeral derived **field projection attached to the existing obligation authority**, not a new persisted certificate family:

- existing obligation/domain and authorized subject binding;
- canonical server-owned field selector and source ID;
- typed stored value with explicit present/empty/unavailable state;
- unit companion only when required by the field definition;
- exact source snapshot identity/content and available row updated_at (read-as-of when needed).

Semantic kind/type comes from the server's field definition, not model prose. Subject/source/domain should reuse existing authority context rather than duplicate independent mutable values. Row updated_at alone is not a guaranteed unique version; bind actual field content/unit plus snapshot provenance. Presentation rounding happens after projection and never changes arithmetic input.

Runtime proof would be: owned row read ? requested canonical field exists in that snapshot ? exact typed value/unit/null projected ? represented without material loss ? obligation binds only those projected source IDs. This can reuse existing source filtering/review/repair/final-binding machinery without assuming historical selection exists. Labs would consume that same derived view. No second truth store and no ?profileWeightCertificate.?

Safest first family: explicit saved_profile reads of direct stored fields across numeric **and** nonnumeric types (name/species/sex/reported breed; weight pair as scalar subtype), without history reconciliation, arithmetic or clinical inference. Weight can then be the first certified scalar **provided** unit presence, exact raw value, subject, profile-domain obligation and snapshot are bound. Current lb default must not itself count as proof of a missing unit.

Free text can be authorized as ?the saved field says X,? not as interpreted clinical truth. Approximate age retains reported/approximate semantics. Derived health state is not included merely because it is JSON.

## Offline characterization and audit

Added `tests/profile-authority-characterization.test.mjs`: 8 tests for raw decimal, missing-unit default, null versus absent property, standalone authority gap, raw-wording field expansion, nonnumeric values, context-level format stability, and wrong-subject source rejection. These characterize existing behavior, including gaps; they are not desired production invariants to preserve forever.

Results:
- New characterization: **8/8**.
- Related existing Ask-profile and profile-save tests: **19/19**.
- Existing profile-file tests: **6/6** with a temporary external extensionless-TypeScript resolver. Direct Node invocation initially failed to load petwise; no test expectation or application import was changed.
- Combined profile checks: **33/33** in the final combined run using that temporary resolver.
- Publication/Labs/authority selection: **74/74**.
- Audit: **208/222**, same exact fourteen baseline failures.
- Offline network guard used; no provider calls.
- No application changes; build/typecheck not rerun for this docs/tests-only analysis.

Baseline audit failure identities:
55 premise repair is bounded and revalidates exact user evidence;
56 a premise repair cannot authorize invented pets or mutation scope;
63 read planner can omit extraction while writes still require a valid frame;
96 five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose;
113 real admission lets a repaired planner reach composition without opening extra repair cycles;
153 supplied premises narrow stale owned-history plans without granting writes;
155 general knowledge never widens owned authority and saved history still validates ownership;
156 supplied-context classification requires actual verbatim user premises;
166 missing premises use bounded repair without inventing evidence;
176 event evidence survives both budgets among verbose routine observations;
177 rejected event answers retain relevant source excerpts instead of the latest profile;
196 new observation plus calculation can repair an invalid correction plan without weakening validation;
212 profile contract mistakes get one bounded repair with full ownership revalidation;
215 a failed mixed answer cannot commit proposed observation side effects.

No expectation weakened, no new authority implemented, no live proof claimed.
