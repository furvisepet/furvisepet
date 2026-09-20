# Read-ticket rejection diagnostics — local only

Base: `fa92d01`, branch `codex/one-interpreter`. This cut adds diagnostics only. It does not identify or repair the earlier live failure's root cause.

## Changes

- `read-ticket.ts`: each existing rejection now carries a `cause.field` and `cause.rule`. Conditions, evaluation order, accepted operations, cross-field constraints and returned tickets remain unchanged. The JSON schema is unchanged.
- `ask-request-contract.ts`: existing request-level read-ticket rejection conditions identify the rejected envelope field (mode, evidence basis, conflicting write job, historical/read-only eligibility).
- `interpret-ask.ts`: emits `[Ask Brain] rejected read ticket` as JSON containing the full original `readTicket`, ticket-presence flag, source message ID, validator field/rule, error code, and outer routing fields. Missing-ticket rejection is also explicit. It then follows the existing rejection path; there is no fallback, repair, extra planner, retrieval or write.
- `ask-read-ticket-diagnostics.test.mjs`: six network-disabled tests cover complete diagnostic serialization, missing anchor, incompatible strategy, request envelope, missing ticket, several invalid fields and a valid dental control.

No changes to Heart, confirmation, receipt adapter, Lungs retrieval, serializer, Mouth, planner instructions or provider schema. No existing tests or audit cases deleted.

## Local proof

A synthetic `read_since_event` ticket with a null anchor logs:

```json
{
  "errorCode": "ASK_REQUEST_CONTRACT_READ_TICKET",
  "field": "temporal.anchor",
  "rule": "anchor_iff_read_since_event"
}
```

The test separately asserts deep equality of the complete logged ticket and the original proposal, and exactly one planner call followed by failure. A complete dental anchor combined with `event_candidates` still rejects and names `outputs.strategy / event_candidates_requires_read_and_predicates`.

These are synthetic controls, not a reconstruction of the lost live proposal. The outer request's `operation: recall` is compatible with a valid `readTicket.operation: read_since_event`; the prior outer-operation log does not establish that the live anchor was missing.

## Verification

- New diagnostics: 6/6 passed.
- Other selected interpreter, read-obligation, episode, needs, Lungs, Heart, list serializer and Cedar route tests: 67/67 passed (73 tests total including diagnostics).
- Typecheck, changed-file ESLint and diff whitespace checks passed.
- Initial Cedar route invocation omitted Node's required `--experimental-transform-types` flag and failed to load existing TypeScript parameter properties. Rerunning that unchanged suite with its documented flag passed 13/13; no application or fixture change was made for the runner error.
- The 222-case audit was not rerun; this cut makes no new audit-total claim.

## Stop

No paid API call, live Ask submission, preview deployment, push or merge in this cut. The existing preview still runs `fa92d01` without these new diagnostics. Production is untouched. The diagnostic patch remains local for review before the user's next live submission.
