# Request retry behavior

One intentional mutation gets one UUID v4/v7. The browser reuses it until it receives a canonical result or the user explicitly abandons that action. It must not create a new key on rerender, timeout, retry-button click, route remount, or an ordinary refresh recovery.

| Result | HTTP/header | Client behavior |
|---|---|---|
| New success | feature status; `Idempotency-Replayed: false` | apply result and clear pending key |
| Completed replay | original semantic status/body; `Idempotency-Replayed: true` | apply canonical result; clear key; no duplicate toast/optimistic row |
| Processing elsewhere | 409 `REQUEST_IN_PROGRESS`, `Retry-After` | preserve draft/key; disable retry until delay; do not create a second optimistic row |
| Same key, changed payload | 409 `IDEMPOTENCY_CONFLICT` | do not retry automatically; restore original fields or explicitly abandon and start a new action |
| Rate limited | 429 | preserve draft/key and wait for `Retry-After` |
| Retryable 5xx | safe stable error | preserve draft/key; bounded retry uses the same key |
| Final/reconciliation failure | stored safe response | do not auto-repeat; surface support/recovery path |

Ask retains one key with the unresolved draft. A double-click is also blocked locally, but the database claim—not UI state—is authoritative. Care, memories, profiles, conversations, suggestions, product feedback, and Vet Brief save use the shared authenticated mutation helper. Product and Vet AI calls pass the same key in both header and legacy body during migration.

`sessionStorage` intentionally contains only a hashed action scope, UUID, and timestamp (maximum 24 hours). It does not contain messages, health notes, profile fields, or provider output. A new intentional repeat gets a new key, even if its text is identical. Per-tab storage does not merge independent actions in different tabs.
