# Shared Ask architecture and validation — 2026-09-09

The latest production UI benchmark remains **46/100**. This branch has not been
merged or deployed to production. Offline tests and the synthetic provider runs
below are not a replacement production benchmark.

## General pipeline changes

- A validated `ask-request.v2` contract carries the standalone question, requested
  obligations, explicit output format, stable conversation references, quantity
  type, owned subjects and independent temporal boundaries. Production bypasses
  legacy question-pattern recovery and topic-specific arithmetic/ranking paths.
- Historical reads use a dedicated composition schema with no mutation proposal
  fields. One canonical body is rendered and reviewed; tables carry structured
  cells and source metadata. With a specified format and history sources, the
  schema requires that body rather than permitting every body field to be null.
- Bounded retrieval shares existing pages and rows between lexical candidates and
  scoped period context. Summaries/comparisons preserve both temporal ends for
  arbitrary topics. Budgets remain 64 roots, 32 records, 18k characters, four pages
  per pet, three pets and five seconds. This does not guarantee semantic recall.
- Arithmetic requires literal source operands, compatible units and server-checked
  operations. Difference means first operand minus second. Counting records,
  measurements or elapsed time cannot route into illness episode counts.
- Review checks factual support and every requested obligation. The server also
  checks the typed JSON/table/bullet format, even if the reviewer approves prose.
  Existing source ownership, correction provenance, explicit date/quantity and
  exact quotation guards remain. Shared review handles uncertain present-state
  and relative-time meaning instead of blanket legacy keyword rejection.
- A rejected shared read may receive one repair using the same evidence, then an
  independent re-review. Only the newly reviewed prose can replace the original.
  Repairs cannot change evidence, ownership, safety routing or persistence proposals.
  Malformed denials grant no approval; bounded feedback may guide repair, whose
  acceptance still requires a fully valid receipt. Malformed initial read output
  enters this governed path instead of requesting a third ordinary provider call.
- Admission caps ordinary calls at two, initial review at three, one repair at
  four and final review at five. Phase order and daily call/cost reservations are
  enforced. Failure, denial, timeout or failed re-review retains the incomplete
  sourced fallback. Provider API retries remain disabled in the live test harness.

Legacy parsers remain for compatibility. This is migration of the shared request
path, not deletion of every old module. Subscription history entitlements and
cross-conversation reference storage are not implemented by this change.

## Verification

- Full `npm test`: 2,441 passing tests, including a wrapper executing 56 shared
  contract/pipeline cases. These use actual orchestration with mocked providers.
- Boundary tests cover ordered five-call accounting, denial of extra/out-of-order
  calls, malformed output, independent rejection of repaired hallucinations,
  foreign source IDs, mutation fields, stable references and typed output formats.
- Production build and TypeScript pass with build artifact uploads disabled.
- Sentry source-map/release uploads now require explicit
  `FURVISE_SENTRY_ARTIFACT_UPLOADS=1`; local validation always disables them.
  Runtime instrumentation remains separately configured. This follows an automatic
  approval rejection of the original build's external artifact upload.
- Real-provider results, including unsuccessful first attempts and repeated
  diagnostics, are preserved in `docs/ask-shared-*-live.json` and calibration files.
  See `ask-shared-validation-results.md` for interpretation and outstanding limits.

## Release gate

Do not infer launch readiness from the offline suite or a successful repeated case.
A fresh, independently graded end-to-end production benchmark remains necessary,
including unseen topics, paraphrases, corrections, sparse/conflicting records,
format requirements, history limits, latency, cost and write safety. Retrieval
coverage and model judgment remain probabilistic. A five-year fixture below has
only 186–187 records; it does not establish performance at dense five-year scale.
