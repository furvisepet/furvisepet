# Furvise broad stress benchmark 6 — blocked before model execution

**No new answer-quality score is available.** Sixty new questions were frozen before submission. Eleven requests were attempted: ten returned a pre-provider spending-cap error, and the eleventh hit request rate limiting following those rapid rejections. No model answers were generated. Forty-nine questions remain unsubmitted. All captures are retained; none was retried or replaced.

The set covers novel fictional records and corrections, long-range chronology, cross-pet attribution, ambiguity, structured output, multilingual and informal wording, non-pet requests, emergencies, privacy/permission boundaries, and multi-turn references. Fictional histories are supplied inside prompts with explicit no-save instructions. They are not newly persisted pets or dense five-year database fixtures. Non-pet helpful answers and respectful scope limitations will be reported separately.

## Confirmed blocker

Production release `623a424073269f448b663ad1edf574477f277db4` was READY at the start. Runtime logs explicitly show `daily_cost_limit`, zero provider calls, no AI credit reservation, and a daily ledger of 1,617 calls / $9.969125. The next provider-call reservation was $0.033432, which would exceed the configured $10 daily cap. Rapid rejected requests subsequently triggered the ordinary request rate limit.

This is an availability failure, not evidence that the model cannot answer the questions. The cap errors also reveal a UX issue: the interface offers a generic safe retry even though an immediate retry cannot resolve an exhausted daily budget. This run remains archived as blocked, not silently removed or scored as a successful 60-question benchmark.

## Budget and resumption

No new provider spending occurred. Total additional spending remains $7.659678 of the $10 authorization; $2.340322 remains. The daily production counter includes earlier testing and is therefore different from the additional authorization counter.

To use the remaining authorized budget today, set production `FURVISE_AI_DAILY_COST_LIMIT_USD` to **12.30**, then redeploy the same source commit. This permits at most $2.330875 more in the current production ledger and keeps combined additional spending below $10 when the recorded direct diagnostics are included. Keep the guard and existing ledger intact. This is an ongoing daily configuration value, not a one-time budget; restore the intended normal operating cap after testing. Alternatively, wait for the daily budget reset and account for the remaining authorization across days.

The available Vercel connector does not expose environment-variable writes. The remote workspace has neither a configured Vercel token nor standard Vercel CLI credentials. No cap change, redeployment, counter reset, or bypass was attempted.

After authorized configuration is available, freeze a separately identified resumed run before submitting questions. Preserve these eleven infrastructure failures alongside it; do not claim all responses were first attempts on the original deployment. Keep the existing answer rubric unchanged, stop submissions after repeated infrastructure errors, check spending at least every six questions, and retain all model-level failures. A completed broader benchmark remains outstanding. The previous 110/120 (91.7%) known-set result is unchanged and is not a score for this broader set.
