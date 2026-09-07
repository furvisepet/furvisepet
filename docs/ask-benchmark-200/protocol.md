# Frozen 200-question benchmark protocol
Baseline application commit7092b74b41483e012665002f130a2bb59ebeda3f.
200 distinct prompts,20 categories x10. Categories interleaved round-robin. Ten follow-up prompts share generated prior user/assistant turns; other prompts are isolated with selected Nori. Four owned synthetic pets;37 care rows including one foreign-owner sentinel. Corrections are explicitly unlinked; no certified episode memberships/completeness or diagnoses/drug names/doses/test results are supplied.

Real configured gpt-5.4-mini interpretation/answer/optional source-review through production callback and response serializer. Database/auth/providers interface adaptation via existing harness. This is NOT live furvise.com, HTTP route, actual DB/RLS, browser, or persistence validation. Harness assertions are recorded separately from application/provider errors. Emergency route shortcuts before the callback are not covered. No actual mutation is executed; accepted write proposals are inspected.

Score after collecting ALL responses, against question-level/category expectations and fixture facts frozen before calls:
- good: directly useful, correct subject and evidence, appropriate uncertainty/safety and requested tone/layout.
- partial: safe and relevant, but incomplete, overly extractive, unnecessary clarification, or presentation mismatch.
- fail: fails core request, materially wrong attribution/facts/unsupported certainty, unsafe guidance or impermissible write proposal.
- error: application/provider could not complete.
- harness_blocked: limitation/assertion in mock boundary, not established production failure.
A refusal/clarification is good when request lacks necessary facts/authority. No-data limitation is not good if fixture has usable answer evidence. Do not infer medical truth from missing data.
Automated flags are screening only; they are NOT a semantic pass score. Review every answer including sections. Report completion and semantic scores separately. No paid model judge, answer retries, repair work, or post-result expectation changes.

Cost: prior100 calls all have returned token usage, USD0.851979 estimated; prior cumulative worst reservations USD4.367871 are preserved in original ledger. New ledger accounts settled calls at returned usage, pending/failed unknown-usage calls at worst reservation. This reconciles completed reservations, does not reset expenditure. Same USD5 user cap, USD4.50 conservative stop. Sequential calls; max600 new calls, max3 per turn with ordinary cap2; no SDK retries/tools; existing authorized key only. Prices inputUSD0.75/outputUSD4.50 per million per https://developers.openai.com/api/docs/models/gpt-5.4-mini verified2026-09-07; cache discounts ignored.

Purely synthetic memory/write testing has no production side effects. Raw answers, outcomes, phase outputs, usage, timing and questions retained. Unknown prior/user external spend cannot be measured by this local ledger. No claim of coverage for every conceivable question or launch readiness.
