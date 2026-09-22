# Certified scalar-fact authority decomposition

Analysis base: 373f20a0b6584a93ae20ea076fdb373199f2b4e0.
Analysis only: no application behavior, schemas, production expectations, deployment or live data changed. No paid APIs.

## Conclusion

Do not implement historical weight subtraction yet. The common historical care record has note text and generic metadata, not an addressable typed body-weight scalar. Existing arithmetic and exact-literal grounding do not prove which number means body weight.

The smallest future boundary is a deterministic field-level projection from an already authorized, version-bound source. It should inherit source authority rather than mint a second source certificate. This is sufficient only for recognized structured fields with enforced meaning and valid units. Prose extraction and model-generated JSON do not become typed factual authority merely because they have a value property.

Safest first numeric family: the explicitly stored current-profile weight, for a genuine profile-weight obligation only. It has clear column semantics and kg/lb units, but still needs profile obligation/snapshot binding before becoming a certified scalar. This does NOT unblock historical endpoint subtraction. If the first implementation must stay inside historical common-path certification, event occurrence time is a genuinely typed field, with date-only precision preserved; it is temporal data, not a substitute body-weight capability.

## Evidence standard

Runtime = concrete implementation/caller. Schema = stored/type constraints, not a guarantee of source entailment. Characterization tests exercise existing helpers, not a new scalar certificate or live publication. Recommendations below are unimplemented.

Repository scope: saved pet/history/profile facts, connected Ask publication and Vet Brief. Product prices, billing/credit accounting, UI counters, internal scores and budgets are not pet-history scalar operands. This is a code/schema inventory, not a database census of populated values.

## Scalar-source inventory

Paths below are under app/lib unless a migration is named.

| Source and field/path | Meaning, representation, units | Origin / effective-state handling | Addressability and present authority | Class |
| --- | --- | --- | --- | --- |
| dog_profiles.weight_value + weight_unit; supabase.ts::DogProfileRow | Profile body weight; PostgreSQL numeric, JS number; separate text unit | User profile field; current mutable snapshot, not care correction lineage | Structurally addressable. pet-profile-api-server.ts::buildPayload writes parsed value/unit; ask-reasoning.ts::buildContextRecords emits profile:<id>:weight. Not a historical selection operand | B + D |
| dog_profiles.age_value + age_unit | User-entered approximate age; numeric with months/years | Profile snapshot, not DOB-derived advancing age | Addressable reported-age field; no exact birth instant, age-as-of measurement proof or fixed month/year duration conversion | B + D |
| dog_profiles.monthly_budget | Owner's budget; numeric, no currency column in profile baseline | Current profile snapshot | Addressable amount, but monetary unit/domain policy not established by this column alone. Do not infer currency from dollar display/country | B + D; currently not a complete monetary scalar |
| dog_profiles.deceased_at / lifecycle_changed_at / created_at / updated_at | Optional lifecycle time and storage timestamps | Lifecycle/current-profile domain | Typed time fields, not interchangeable; updated_at is not measurement time | B + D |
| pet_care_entries.occurred_at / created_at / updated_at | Event occurrence / save / revision timestamp | Common effective history, owned subject | Deterministically addressable. Must inherit common receipt and represented snapshot; occurrence is not automatically onset, resolution or measurement timestamp | A candidate, subject to source proof |
| care_event_metadata.explicitTime via care-occurrence.ts::careOccurrence | Explicit date precision, string YYYY-MM-DD in recognized condition | Preserves civil date when occurred_at equals that date at UTC midnight | Deterministic temporal representation, not measurement metadata. Other arbitrary metadata keys confer no scalar authority | A temporal candidate / B transformed representation |
| pet_care_entries.note / title | Weight, dose, food amount, temperature, other measurements when reported | Original prose; common effective history can certify the record | No declared numeric measurement/value/unit column or registered scalar field reader found. Record category/topic does not identify each number | C; D when model chooses a literal |
| care_event_metadata generic JSON | Semantic topic/state/transition, precision/provenance and other metadata | Multiple writers; CareEntryRow declares Record<string, unknown> | No production typed weight/dose/food/temperature numeric contract found. A convenient JSON key would not itself be authority | B container, not certified scalar |
| Semantic assertion claims: structured_value.value + unit + concept fields | SemanticLiteral allows string, number, boolean, null or array; unit free text | ProposedSemanticFrame model assertion; governance grounds quote/subject and persistence permissions | Addressable JSON but no deterministic scalar-value-to-meaning certificate. govern-turn.ts::structuredValue copies claim.value. This is not equivalent to a structured user measurement form | B storage + D origin |
| Imported/owner-note semantic claims: structured_value.note/title/severity | Stored prose and categorical metadata | history-retrieval.ts compares imported payload to current care source, then effective graph | Common readable claim often contains a note, not a numeric value. Do not confuse all structured_value payloads with typed measurements | C |
| furvise_memories.fact_value / normalized_value; legacy memory text | Remembered prose/normalized strings | Memory freshness/forgetting and source provenance apply | intelligence/types.ts declares strings; numerical wording still requires interpretation | C/D |
| pet-state/types.ts::CanonicalPetState | Status, confidence, lastObservedAt, medication name/startedAt/sourceEventId | Derived current-state projection | currentMedications does not declare dose/concentration; currentFood is a status value, not amount. Confidence/state_version are internal metadata, not clinical numeric facts | B metadata; no dose/food scalar |
| episodes/types.ts::CareEpisode timestamps / sequence_number | Episode lifecycle timestamps and registered ordinal | Domain membership/lifecycle proofs | Sequence is not occurrence count; timestamp roles need domain proof | B; E for governed census |
| record-inventory.ts count and episode census total | Set cardinality, not a record field | Physical row inventory versus governed episode membership | Exact domain must remain explicit; exhaustive/common set proof or existing valid census required | E |
| read-projection.ts::bodyMeasurement / profileBodyMeasurement | Regex-selected positive mass from prose/formatted profile text | Legacy non-ticket factual projections | Parser rejects several uncertain/multiple/equipment cases but does not produce a generic scalar proof | C/F; profile parsed from text is D domain |
| history-calculation.ts::verifiedCalculationQuantities | Numeric/unit literal or exact occurredAt selected by proposal | Arithmetic-only source checking | No subject, quantity-role, obligation/certificate parameter. A matched literal is not certified meaning | C/D/F for operand authority |
| source-bound-schema.ts::sourceBoundSchema | Enumerates numeric/unit literals, dates and count IDs from represented text | Provider constraint before generation | Limits IDs/literals, not which quantity a token denotes; body/carrier/previous masses all eligible choices | D, constrained syntax |
| history-narrative-facts.ts::historyNarrativeAnchorsSupported | Numeric/date anchors and legacy derived support | Review, publication and repair callers | Token/dimension checks; legacy kg deltas/durations and requested conversion remain distinct from scalar certification | C/F |
| labs-list.ts::LabsList.records + labs-presentation.ts::renderCertifiedLabs | id/sourceId/petId/event_at/body/predicates | Selection/resultSet proof plus immutable server snapshot | Renders exact selected note bodies. Does not extract body mass or create scalar cells; calculations remains [] | A source representation, not scalar extraction |
| vet-brief/builder.ts profile formatters and evidence/review path | Profile age/weight strings plus historical prose | Separate Brief evidence/review | formatAge/formatWeight require value/unit and interpolate stored numbers; history measurements remain prose/model review | D and C; separate future migration |
| Current user report / conversation source | Supplied amounts/dates in exact user text | User attribution/grounding, not saved record certificate | A quote supports attributed reporting, not automatic deterministic typed scalar interpretation | C/D |

Schema anchors: migrations 20260622000000_create_pet_profile_baseline.sql and 20260623000000_create_pet_care_entries.sql; current types supabase.ts::DogProfileRow/CareEntryRow. No dedicated historical measurement table/typed dose/food quantity/temperature field was found in the tracked application schemas and readers inspected.

## Why structured claims are not an immediate shortcut

semantic-frame/types.ts::ProposedAssertionClaim has value and unit, but predicate is a ProposedConcept (label/definition/aliases). semantic-frame/validate-evidence.ts::validateSemanticFrameEvidence verifies quote coordinates and exact source text, not equality or semantic entailment of claim.value.

v2/governance/govern-turn.ts assigns structuredValue from the proposal and unit from the assertion. It applies subject, modality, owner-evidence and persistence checks; these do not amount to an explicit deterministic scalar-field verifier. It marks this governed path shadow_only / ask_v2_shadow. Other imported/writer-backed claims have separate provenance and commonly carry notes. Do not blanket-promote either kind.

v2/concepts/normalize.ts::inferClaimSignature can assign weight_measurement from an animal holder plus mass unit. That signature cannot distinguish food mass, medication mass, equipment mass and body mass by itself. Canonical concept resolution is not proof that every proposed number belongs to that quantity.

A test intentionally passes value=999 alongside a valid quote containing 12 kg and 2 kg to the quote-coordinate helper. It passes that helper only. This does not assert the full write/publication pipeline accepts the claim.

## Semantic identity

Current strongest deterministic quantity identity is a known storage column: profile.weight_value means profile body weight; profile.age_value means reported profile age. The new field reader must use a server-owned field definition, not user/model field paths.

A field definition should establish quantity kind, measured entity/role, allowed source shape and units. Same dimension alone is insufficient. The same patient and kg can mean body, carrier or ration mass. Medication strength, prescribed amount per dose, concentration and actual administered amount are different identities. CLAIM_AUTHORITY_POLICY and historical-read-response instructions already describe these distinctions, but that is model guidance, not a field-level runtime proof.

No recognized scalar field => no deterministic calculation operand, even when the enclosing source is certified.

## Minimal future scalar boundary (recommendation only)

Prefer a server-derived view rather than a new independent scalar certificate:

ScalarFactView:
- existing sourceObligationId / authority binding reference
- existing sourceId and source snapshot/revision reference
- server-known field selector (including stable subfield/member identity if the schema defines it)
- stored value and explicit stored unit
- normalized value/unit produced by existing dimensional logic

The field definition supplies quantity kind and dimension. Subject, owner, event/save timestamps and source status should be obtained from the bound snapshot/obligation, not duplicated authoritative fields. A view may expose those for convenience but they are derived, not independently editable truth.

No model-owned scalar ID. A deterministic source+version+field key is enough if an identity is useful. No free-form JSON path from the model.

Do not store authorityStatus as a separately mutable fact: success means the required source/field checks passed for this snapshot. Failure has a specific reason. Canonical values may be transient deterministic outputs, not a second persisted truth store.

Precision:
- Carry an exact source decimal/token only when actually available.
- Current JS number representation does not preserve trailing-zero significant figures or arbitrary PostgreSQL numeric precision.
- Unknown measurement precision remains unknown; do not infer confidence or exact physical measurement from a numeric column.
- Output rounding policy is separate. A source reported approximately must remain approximate and is outside a strict exact-scalar V1 unless an explicit uncertainty contract later exists.

Prerequisites:
1. Source is authorized for this exact obligation, owner/subject and domain.
2. Existing effective/source proof is current and permits this record.
3. Field belongs to the recognized schema and satisfies semantic identity, finite/type/unit rules.
4. Raw values match the bound source snapshot.
5. Scalar projection introduces no additional record, meaning, unit or completeness authority.

No new source-certificate family is necessary for these recognized fields. Prose semantic extraction would require additional evidence proof; do not pretend this view supplies it. A later derived calculation receipt remains separate from the field projection.

## Units and precision

history-calculation.ts::units is the existing shared dimensional registry:
- Mass base scale grams: kg=1000, g=1, mg=.001, lb=453.59237; supported word aliases.
- Volume base ml: ml=1, l=1000.
- Time base hours: seconds/minutes/hours/days/weeks; days are fixed 24h, not calendar duration.
- Length base metres: km/m/cm/mm with aliases.
- Explicit currency-code dimensions; no FX or ambiguous dollar-symbol inference.
- compoundUnit supports two known unit components; restricted evaluator dimension rules still apply.

canonical in this registry normalizes unit spelling, not every dimension into one universal output unit. Reuse its scale/identity rules; do not create a competing kg/lb table.

Missing capabilities: Celsius/Fahrenheit affine conversion, calendar months/years, generic biological semantic quantity identity, unknown-unit resolution and a uniform precision policy. The profile UI supports kg/lb and age months/years. The concept-signature recognizer also accepts oz, which the arithmetic registry does not; that is not permission to infer a conversion. Unit support is not universally consistent.

Storage: PostgreSQL numeric -> app number; parsePositiveNumber validates decimal lexical input then Number. No declared fixed clinical scale. Profile type alone is not sufficient runtime validation; legacy/imported/missing units must be checked.
Display: pet-profile-file.ts::formatNumber rounds to one decimal (4.71 -> 4.7). ask-reasoning.ts::buildContextRecords uses direct number interpolation and missing-unit defaults lb/years. Vet Brief requires both unit/value. dogProfileRowToDraft normalizes unknown weight unit to lb. These existing display defaults are NOT an acceptable future missing-unit scalar rule.
Legacy projection conversions often round to eight decimals, current/history delta has separate 2-3 decimal policy, percent one decimal.
Arithmetic validator checks computed result at proposal decimal precision (max ten), so a model can propose a coarse rounded result. Source literal binding still rejects 4.7 kg when the only original literal is 4.71 kg. Binding precision and result rounding are different.

Future arithmetic should use the validated stored/canonical number, not display text, without claiming greater precision than storage or measurement supplies.

## Effective-history inheritance

history-retrieval.ts's effective graph hydration verifies source ownership, correction graph closure, tombstones and imported note/title/severity/subject/date freshness before common selection; effective-selection and publication receipts remain the source authority. A scalar reader must consume that selected effective snapshot, never requery an old record by ID and assume validity.

Examples:
- 10 kg replaced by 11 kg: old source field is not reusable; obtain the effective replacement and revalidate its field.
- Deleted measurement: no scalar, even if old body text remains cached.
- Same field on replacement: field name equality does not preserve old value authority.
- Unit/kind changes: revalidate both semantic identity and conversion; do not carry forward previous unit/kind.
- Same-ID edit: bind content/version, not ID alone.
- Incomplete lineage: scalar may be readable as unverified material, but cannot become certified for the blocked obligation.

No separate lineage engine. Existing common freshness comparison checks prose-oriented fields; adding a historical structured scalar later would also require verifying that its value/unit fields are included in the authoritative source snapshot/freshness contract. Metadata currently being present does not prove that.

Dates: careOccurrence recognizes civil precision; occurred_at and created_at have different meanings. Date-only must not silently become a measured midnight instant or elapsed-time operand. Age months/years must not be treated as fixed-duration units.

## Profile boundary

Profile weight is a legitimate current-profile fact, not a latest historical measurement. publication-authority.ts::derivePublicationAuthority already builds separate profile components when applicable and limits certified selection components to certificate-derived care sources. checkPublicationAuthority rejects calculations under selection-only authority.

Future profile scalar authority must bind the owned loaded profile field and its snapshot for an explicit profile obligation. Do not relabel profile source IDs as care IDs, use profile.updated_at as a measurement date, or infer a prior profile value from history. Missing unit should fail scalar projection even where current display defaults to lb.

A historical+profile comparison requires two independently valid obligation domains; one cannot repair a missing operand in the other.

## Prose-only measurements and counterexamples

V1 recommendation: no certified scalar -> deterministic calculation unavailable. Preserve quoted note publication and existing uncertainty; do not convert the source parser into a certified scalar merely because its regex is deterministic.

read-projection.ts::bodyMeasurement rejects multiple recognized phrases, uncertainty and some equipment/correction terms. It still uses a narrow English parser and does not emit a general semantic proof. It is not an adequate generic extraction certification boundary.

| Counterexample | Required future treatment |
| --- | --- |
| Recognized typed profile body-weight field | Candidate only under owned profile obligation, valid unit and bound snapshot |
| Same record body weight plus carrier kg | Known typed body-weight field may be used; text-token alternatives cannot |
| Current 12 kg / previous 10 kg in prose | Neither chosen automatically |
| Approximate 12 / exact 11.8 in prose | No authority by numeric proximity or syntactic exactness |
| Dose 5 mg / concentration 5 mg per ml | Different semantic quantities; no substitution |
| Date plus measurement | Date is temporal field/quote; not count or measurement |
| Mention of someone else's older value | Source subject alone cannot assign every number to the pet/current occasion |
| Multiple typed measurements | Require existing schema-defined semantic role and member binding; arbitrary array position is not enough |
| Missing/unknown unit | No default in scalar authority |
| Profile differs from certified history | Separate obligation domains, no substitution |
| Corrected or deleted source | Inherit common effective proof; old scalar invalid |
| kg/lb equivalents | Normalize with shared registry after meaning/source validation |
| Stored 4.71 / displayed 4.7 | Bind stored 4.71, never display string |
| Same scalar, paraphrased question | Identical binding/value; no downstream wording selection |
| Unauthorized record / unknown field on certified record | Reject; record certification grants no arbitrary field authority |

## Counts and derived values

Set-derived counts are not record scalar fields. An exact count needs certified membership of the specified domain (effective notes, physical rows, episodes etc.). Average needs membership plus scalar authority for every included value. A bounded subset count is not a lifetime count.

A future arithmetic kernel can accept numeric inputs from either:
- recognized field projection over authorized source; or
- deterministic set-derived receipt over authorized membership.

Keep proof origins distinct. Do not disguise a count as a made-up record field.

## Publication and Labs gaps

Current Labs snapshot protects selected source bodies and membership, and renderer quotes the whole body in prose/list/table/compact. It does not isolate or certify a measurement. That is safe record presentation, not proof that every number is a valid operand.

sourceBoundSchema constrains provider operand IDs/literals but offers all matching tokens. verifiedCalculationQuantities verifies syntax, dimensions and arithmetic, not semantic field selection. Model instructions/review cover semantic relationships in legacy paths. Source-level numeric anchor support is not field-level authorization.

Future Labs scalar presentation must read the exact server-produced scalar view. Model-assisted paths must bind claims to that same field/value/unit/subject snapshot; citing the correct record while using another number must fail. Derived calculations require a later receipt. Do not broaden current selection-only authority as part of scalar projection.

## First implementation recommendation

1. Implement the generic field-view boundary using explicit current-profile weight as the first numeric adapter, ONLY if a bounded profile-authority cut is authorized. Validate raw numeric type/range, known unit and current snapshot. No prose parsing.
2. If staying strictly in historical common-path work, begin with existing typed event-time fields and preserve civil precision. This does not solve historical measurement arithmetic.
3. Historical body weight cannot be the immediate zero-inference family in the current schema. It needs trustworthy structured capture or a later generic semantic extraction proof. Do not auto-backfill prose using a model/regex and call it certified.
4. Signed historical subtraction cannot follow directly from this analysis. It can follow only once two semantically compatible scalar inputs are established under source obligations and deterministic precision policy, then the separately authorized derived receipt is implemented.

Retire eventually: model choice among note numbers as factual operand authority; untyped profile-unit fallback for arithmetic; mass-unit signature equated with body weight; display-string operand parsing; token coincidence or exact quote mistaken for semantic proof. Preserve existing source/effective/publication guards meanwhile.

## Verification

Added tests/scalar-authority-characterization.test.mjs: 8/8.
Combined with prior derived characterization (10) and calculation/repair binding (6): 24/24.
Publication/Labs/authority: 74/74.
Full audit: 208/222; exact same fourteen failure identities as the prior saved baseline, machine-compared.
Offline network guard loaded for all runs. Dependency-complete checkout app and audit-script files verified byte-identical to the analysis checkout.
No existing test expectation changes. No build/typecheck rerun claimed for this docs/tests-only cut.
The counterexamples demonstrate helper boundaries, not production acceptance or a new scalar proof.
