# Follow-up after the frozen 15-question production run

The original 6 pass / 3 partial / 3 fail / 3 error result is unchanged. This change has no new live accuracy score and used no paid provider calls.

The ranking request failed with ASK_REQUEST_CONTRACT_REFERENCE before subject resolution. Recovery now accepts a bad advisory reference ID only when independently reconstructed, USER-authored dated scope is available for a read. Unknown IDs are discarded, trusted anchor IDs replace them, and ownership validation still applies. Writes, supplied scenarios, and requests without a recoverable anchor retain strict rejection.

An offline replay with production-shaped measurement notes successfully reached server-read-projection. This does not identify the live CSV miss. A separate reproduced defect was that a comparison label removed a one-day projection window. A valid CSV/table projection with one matching explicit date now retains that window; open intervals, multiple dates, and past-versus-present requests retain their broader temporal obligations. Independent review remains mandatory.

Validation covers plural follow-ups, nonrecoverable references, write rejection, exact-day CSV/table execution with zero narrative calls, and temporal counterexamples. No pet or history records changed.

Remaining live problems include rejected or timed-out reviews, incomplete arithmetic delivery, interpretation timeout, and evidence selection for multi-part comparisons. These fixes do not establish 95% reliability or prove the live CSV cause.
