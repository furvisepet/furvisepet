# Canonical calendar policy ? recommendation only

Base: dc26aa953b4c84d4bf25a4f510229e63a84f5ec5. No production behavior or application code changes. This document defines a proposed policy, not a new implemented calendar contract. No partitioning, deployment, live Ask or paid API calls.

## Decision

Use one **precision-aware request-calendar policy** for the new architecture:

- A true event instant is mapped into day/month/year using the validated, frozen request IANA timezone.
- A grounded date-only event is a civil date. Its year/month/day are taken directly from that date; it never changes because the reader changes zones.
- Unknown occurrence time stays unknown. A save timestamp is not promoted into an event date.
- Semantic temporal domain, server access bounds and as-of eligibility are applied independently of bucketing. A bucket is not permission to retrieve outside scope or include future events.

This is option B with preservation of date precision, not per-feature timezone rules. All ordinary calendar operations, explicit date windows, occupied-bucket selection, grouping and date-valued as-of boundaries should use it. Facts keep their actual precision; the policy does not coerce every record into an instant.

## Evidence inventory

| Input | Stored/available representation | Timezone/precision available | Conversion without guessing |
|---|---|---|---|
| Event instant | pet_care_entries.occurred_at timestamptz; CareEntryRow string; generic order field event_at maps to occurrence, not a separate stored event_at column | Absolute instant available when written as timestamp; original IANA event zone is not retained by timestamptz alone | Convert known instant to request calendar exactly; original event-local date cannot be recovered without original zone |
| Legacy date-only event | occurred_at at UTC midnight plus care_event_metadata.explicitTime YYYY-MM-DD | Explicit date precision; current careOccurrence recognizes date+matching UTC-midnight storage | Preserve civil date; UTC midnight is an encoding, not observed clock time |
| Owner-report date-only event | Grounded owner metadata authority=owner_report, explicitTime date; occurred_at may be request-local midnight | explicitNoteTime resolves current request zone at save; history-archive.explicitCareEntryDate already preserves grounded owner date regardless of timestamp encoding | Preserve date even when reading in another zone; do not require UTC-midnight equality for this known provenance |
| Dated batch legacy entry | source=ask_furvise with validated sourceNoteIndex/sourceNoteCount; explicit date or compatibility fallback | history-archive has narrow recognized batch handling | Use only documented provenance-based adapter; do not generalize midnight inference to all rows |
| Explicit date plus clock | temporal.occurredAt plus explicitTime text; owner-note code validates local clock against request zone | Known instant when resolution succeeded; original IANA zone not a dedicated row field | Request-local conversion possible; original wall-clock policy not reconstructible from arbitrary wording |
| Manual care log | datetime-local form -> JS Date -> ISO -> occurred_at; API update passes timestamp to controlled write | Browser interprets input local clock; absolute instant persists | Convert instant; do not assume future browser zone equals entry zone |
| Save/created/update times | created_at, updated_at; source-message/claim timestamps and receipt provenance | Database/server instants | Use for recorded/saved-time queries, revision provenance and existing tie-breaks; never replace occurrence for event-calendar claims |
| Unspecified occurrence | Some records metadata occurrenceBasis=recorded_at; history UI explicitly labels event date unspecified | Save instant is known but occurrence is not | No event-bucket assignment from save time. Recorded-date grouping remains possible if that is the actual semantic request |
| Explicit request date | Legacy p.from/to civil dates converted by calendarWindowToInstants; typed ticket temporal.from/to are ISO instants | Request IANA zone supplied separately, native bounds already concrete | Date-valued bounds require local-midnight resolution; offset-bearing instants must remain unchanged |
| Request timezone | Ask UI Intl.DateTimeFormat().resolvedOptions().timeZone; JSON timeZone; resolveAskTimeZone | Validated IANA identifier; invalid/missing currently falls back UTC | Deterministic request calendar, not evidence of event location or subject ownership |
| Account timezone | No dedicated persisted account/owner timezone field or lookup found in inspected application types/migrations | Not available as a current authority source | Do not invent preference, geolocate, or infer from locale/IP |
| Historical record without event timezone | Usually still has timestamptz; generic metadata may or may not carry explicit date precision | Instant can be known while original zone/precision is unknown | Request-calendar conversion is possible for a known instant; no original event-local reconstruction. Missing date precision cannot be inferred from midnight |
| Future-dated record | Same occurred_at storage can contain a later instant/date | Its stored date is not evidence that it has happened | Bucket value can be described if explicitly requested and access permits; ordinary historical as-of acquisition excludes future instants. No new future permission here |

Sources inspected: supabase/migrations/20260623000000_create_pet_care_entries.sql; app/lib/supabase.ts; care-log.mjs; components/care-entry-form.tsx; intelligence/owner-note-request.ts; explicit-owner-note.ts; dated-note-batch.ts; semantic-event-persistence.ts; history-archive.ts; care-occurrence.ts. This is repository inspection, not a database census of live records.

Generic JSON metadata is not automatically trustworthy date authority. Adapters must recognize existing governed provenance and lineage. Conflicting or malformed metadata is not solved by choosing whichever date is convenient. source-calendar-date's leading-text display attribution is not permission for downstream calendar code to parse arbitrary notes into authoritative dates.

## Alternatives considered

| Policy | Benefit | Reason accepted/rejected |
|---|---|---|
| UTC for everything | Simple reproducible boundaries | Reject as default user calendar: a late evening observation becomes tomorrow or next year; conflicts with existing UI/local-date tests. Keep as explicit request zone and temporary legacy compatibility |
| Frozen request-local calendar, date precision preserved | Matches displayed calendar and named periods; one comparable calendar across pets/events | Recommended. Same instant can yield different buckets for two explicitly different request zones, without changing the fact |
| Event-local where known, fallback elsewhere | Sometimes matches location at occurrence | Reject as default: no uniform event-zone provenance, traveling events get mixed calendars, fallback changes grouping inconsistently. A separately requested original-local-calendar claim requires actual provenance and cannot be guessed |
| Current device zone re-evaluated during execution | Easy to read from environment | Reject: retries and phases could change membership. Resolve once at request admission and carry the same value |

Reproducibility means same effective ledger revision, semantic query, resolved zone, as-of and date-precision policy produce the same membership. It does not mean different zones must produce identical calendar groups. Replaying a historical calculation should reuse its captured request zone/as-of, not today's device zone. IANA historical rules/runtime timezone data also matter for long-lived replay; proof provenance should record policy/version and resolved boundaries where material. This recommends provenance, not a new truth store or new schema in this cut.

## Timezone authority and fallback

app/ask/page.tsx sends the browser IANA timezone for ordinary requests and rebuilt retry payloads. app/api/ask/route.ts accepts body.timeZone, validates it through resolveAskTimeZone, includes it when supplied in aiCreditPayload/hash, and replaces the payload with canonicalPayload on the existing canonical recovery path. Context construction uses resolveAskTimeZone(aiCreditPayload.timeZone). interpretation input carries timeZone and calendarDateInZone(today). Free-text timezone inference is not the authority source.

Treat this as a validated request preference, not server-attested physical location. It cannot expand owner/subject/access authority. Freeze the normalized zone before interpretation/retrieval and reuse it for every downstream phase. Existing recovery uses canonical payload; any future generic calendar proof must carry that same resolved zone rather than reading ambient browser/host settings.

Recommended fallback: retain UTC for absent/invalid zone, explicitly identified as a default in the semantic/provenance record and surfaced when the distinction matters (e.g. bucket boundary labels). This is a defined calendar, not a guess about the user's local calendar. A UTC-calendar claim can be certified normally; missing local preference alone should not mark correctly proved UTC facts partial.

If the requested obligation specifically requires an unknown original event-local calendar, or requires user-local semantics but no user-local zone is available/accepted, that obligation remains unresolved and needs clarification/limitation. Do not silently claim a UTC answer is local. Do not infer zone from country, locale, pet, note words or IP. No new account-timezone preference is proposed in this cut.

## Date-only facts and timestamped facts

Date-only 2026-09-15 always has day=2026-09-15, month=2026-09, year=2026. Its calendar identity is independent of UTC, Los Angeles or Tokyo. Use canonical grounded civil date after effective-history resolution. A local-midnight instant can be used as a storage/query boundary adapter, but must not acquire factual clock precision or redefine the date.

Timestamp 2026-01-01T01:00Z is an instant: UTC yields 2026-01-01; America/Los_Angeles yields 2025-12-31. Under a Los Angeles request it belongs to December 2025. All timestamped rows in that request use the same calendar, including events recorded in another location.

Missing original event zone is harmless for request-calendar conversion of an absolute instant. Missing or conflicting occurrence precision is not harmless. A timezone-less clock string must not be parsed using host timezone; without validated origin rules it is unresolved. An unmarked midnight timestamptz remains its recorded instant, not an inferred date-only value. Explicit occurrenceBasis=recorded_at is not an actual occurrence assertion: event-date-dependent completeness must account for that unknown, while saved-date requests may use created_at.

## Windows, buckets and as-of

An explicit local date window is a pair of civil bounds resolved in the frozen zone. Sep 15 inclusive through Sep 15 means [Sep 15 local midnight, Sep 16 local midnight), each boundary independently resolved by the existing DST-aware utility. Do not add 86,400 seconds: days can be 23 or 25 hours. A skipped local date must not be silently relabeled as another civil date; a stored date-only label retains its identity, and an impossible instant boundary requires an explicit limitation if the claim depends on it.

An offset-bearing timestamp bound is already an instant and must not be run through the date-only boundary converter. Calendar partitioning is different: it maps each effective member to a year/month/day key; it does not invent a query interval or grant coverage. Bucket intervals are intersected with authorized access and requested scope.

For date-valued windows and date-only records, compare civil dates directly. For a partial-day INSTANT window, a date-only record has uncertain time within its civil day: fully disjoint excludes; wholly included can satisfy date membership; overlap without a clock cannot certify before/after a sub-day cutoff. Do not use synthetic midnight to resolve that uncertainty or establish event order inside the day.

The server as-of instant must also be frozen. For actual timestamps, future means event instant exceeds that as-of. Same local day does not make a future clock time historical. For date-only historical reports, a day later than the as-of local date remains future; today's date-only report is attributable as a recorded report but does not prove occurrence before an exact clock cutoff. Publication/certification must retain that precision distinction. A date-valued as-of includes the named calendar day using the next local date boundary, subject to current server-history scope; it does not make future events past. No authorization to expand the existing ticket as-of clamp is implied.

Access entitlements are independent server bounds. A storage candidate-envelope adjustment may avoid dropping date-only records at timezone edges only within existing authorization; it is not an access expansion. Ambiguous intersection with a partial-day access bound cannot be waved away by bucket membership.

## C053

Keep operator order: authorized effective history -> oldest occupied YEAR per subject -> topic predicates inside that year -> requested record selection/all matching records. This is not oldest year containing the topic.

Under the proposed policy, timestamp year comes from frozen request zone; grounded date-only year comes directly from its civil date. Timezone can change the oldest occupied year near New Year. That is an intentional semantic change from current ticket UTC buckets, not a harmless implementation detail.

Current C053 fixture uses September/December 2021 and January 2, 2025, with partial-access start September 16, 2021. Selected record IDs/year remain unchanged in the tested UTC/Los Angeles/Tokyo calendars. Its current UTC execution fixture remains entirely unchanged. For non-UTC requests, the semantic end-of-year instant would become local Jan 1 rather than UTC Jan 1; equal selected IDs do not prove all boundary metadata identical.

Oldest-bucket proof must close effective lineage/date precision, establish the boundary witness and no earlier occupied bucket in the exact authorized domain for the subject(s), and account for unknown-date records that could defeat the claim. Then prove matching membership/within-bucket selection separately. Finding an earliest raw timestamp is not enough. The current all-scan exhaustion behavior and lack of separate bucket certificates are documented in the preceding inventory, not changed here.

## Corrections and lineage

Calendar identity uses the effective record's occurrence value AND effective precision metadata together. A correction can change instant, civil date, precision, predicate membership or subject; all affected bucket membership must be recomputed after existing authorization/effective resolution. A tombstone removing the sole member empties a bucket and may change the oldest/newest occupied bucket. Later correction authors outside the queried bucket may move records across its edge. Closed proof must cover these relationships before selecting buckets.

Do not combine a corrected timestamp with stale pre-correction date-only metadata, infer a correction date from created_at, or keep a superseded record because its bucket sorts earlier. Conflicts remain unresolved under existing lineage rules. No mutation or correction implementation changes are authorized by this document.

## Compatibility impact

| Current path | Impact under canonical policy | Required compatibility treatment |
|---|---|---|
| Native explicit ISO bounds + genuine timestamps | Identical instant semantics | Preserve instants; zone used only for calendar presentation/partition |
| Ticket oldest_year | Intentional change near UTC/local year boundary and for date precision | Temporary explicitly labeled UTC legacy adapter until authorized semantic migration; future normalized plan must record chosen calendar, not infer from strategy |
| Ticket calendar_samples | Intentional change in pet/year membership and selected representatives near boundaries | Same explicit compatibility distinction; retain bounded sampling/exhaustive limitations |
| Current UTC C053 fixture | Same window and records in UTC; same record set for tested local calendars | Preserve existing test; add separate canonical-zone fixtures rather than rewriting expected production behavior now |
| Non-ticket oldestCalendarUnit + calendarPeriodContaining | Usually same for genuine instants/local policy | Replace raw-row authority eventually; date-only metadata needs precision-aware adapter |
| Explicit local day/month targets and historicalAgeCutoff | Existing local calendar convention generally matches | Reuse boundary/DST conversion and clipping; no raw-English migration in this task |
| relativeYearsAgoWindow | Current local current-year choice + UTC boundaries is inconsistent | Intentionally change to local boundaries when migrated; do not silently preserve hybrid behavior |
| Previous-month food projection | Current local period + UTC substring matching is wrong near boundaries | Later generic window migration; do not create food-specific timezone logic |
| Legacy UTC-midnight date-only careOccurrence | Existing LA/Tokyo invariant retained | Preserve civil date, including recognized metadata provenance |
| Owner date stored at local midnight | Current careOccurrence's UTC-equality guard may fail after reader zone changes | General precision-aware adapter needed; history-archive already preserves grounded owner explicit date |
| Date-looking timestamp with no precision metadata | Ambiguous original intent | Treat known stored instant as instant; do not reconstruct date-only intent. Mark provenance limitations when requested claim depends on unavailable origin precision |
| sourceDisplayDate/leading text; Vet Brief date handling | May differ from structured metadata or mixed timestamp policy | Attribution text alone cannot establish bucket membership; report conflict. No Brief changes in this cut |
| history-archive year filter (host local year) | Usually matches browser UI zone, not guaranteed replay-safe | Future server semantics use frozen request zone; no host-timezone authority |
| Grounded independent needs/probe windows | Concrete instant bounds unchanged | Preserve date precision/target provenance; do not infer zone from need IDs or target labels |
| Calendar-independent plain top-N by actual event instant | Unchanged by bucket policy | Do not reorder timestamps merely to normalize date display; date-only sub-day ordering needs its own precision handling |
| Future-dated and occurrence-unspecified data | Cannot be treated as observed past merely because a storage timestamp exists | Preserve/expose uncertainty and access/as-of constraints; no new future/history permissions |

Temporary adapters must make policy differences explicit; they must not become a permanent per-feature timezone switch. No data rewrite/migration is proposed without a provenance census. Missing original event timezone does not justify changing a stored instant.

## Tests and verification

Added tests/calendar-policy-analysis.test.mjs: 14 documentation/counterexample tests. They use existing date utilities plus a test-only composition of explicitCareEntryDate and calendarDateInZone, not an application calendar implementation. Covers UTC/local year and month boundaries; LA/Tokyo existing date-only invariants; owner-local-midnight date invariance across reading zones; unmarked midnight timestamp; DST explicit window; same instant/two zones; effective correction crossing a year; tombstone; C053 record membership; missing-zone UTC; future instant versus local calendar day.

Calendar policy + previous analysis + existing timezone/general gates: 35/35.
Body/architecture: 185/185.
Audit: 208/222 with exactly the same 14 failures, programmatically compared. Existing LA/Tokyo date-only audit cases and C053 still pass. No existing test expectations changed.

Offline network guard enabled. Application diff must be empty; docs/tests-only commit. No typecheck/build rerun warranted by documentation-only policy and isolated test additions; prior base results unchanged, not represented as freshly rerun. Whitespace checked before commit.
