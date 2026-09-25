# Furvise Public V1 Runtime Acceptance

Status: required before first public users.

## Target

- Cutover rehearsal commit: `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`
- Tree: `aac9fd48da5fbfa1168c48656688b3a86be95b34`
- Vercel deployment: `dpl_CwS5wqeYVQgEFLowk5fi5E9N9apn`
- Preview host: `furvise-baw1bcfdo-furvise-0e3fe5ef.vercel.app`
- This tree is byte-identical to `launch/public-v1-rc` at `8c4577f38b98b593e53f25840f6b8ca2ffc04010`.

Do not test another preview and transfer the result to this one.

## Rules

A failure is launch-blocking only when a retained V1 path is incorrect or an excluded capability leaks through.

Blockers:
- wrong-account or wrong-pet data;
- UI add/edit/remove does not round-trip;
- removed state reappears as effective history;
- factual Ask publishes the wrong saved fact;
- Ask performs a mutation;
- Ask publishes arithmetic;
- new Vet Brief generation starts;
- retry duplicates a write or charge;
- emergency handling is intercepted by normal provider/quota flow;
- auth/core journey is broken.

Not blockers:
- a V2 calculation request returns a deliberate limitation;
- an Ask-write request returns a deliberate limitation;
- new Vet Brief generation is unavailable;
- deferred architecture tests remain red.

## Test fixture

Use a dedicated acceptance account and synthetic pet data only.

Create two pets with obviously different names and facts so leakage is visible.

Suggested fixture:
- Pet A: name `Atlas QA`
- Pet B: name `Basil QA`

Use unique note text that cannot collide with existing records, for example a timestamped acceptance marker.

Do not use real customer data.

## Runtime matrix

### R1 — Authentication and first pet

Action:
- open preview;
- sign in with the dedicated acceptance account;
- create/select Pet A if the fixture does not already exist.

Pass:
- authenticated app opens;
- selected pet is Pet A;
- no data from another account appears.

Block on:
- login/session loop;
- another account's data;
- pet creation fails on an otherwise valid account.

### R2 — Explicit UI append round-trip

Action:
- add one care/history note through the normal Today/History UI;
- record the exact displayed text and timestamp;
- open History.

Pass:
- exactly one new entry appears;
- text belongs to Pet A;
- refresh leaves one entry, not two.

Block on:
- missing entry;
- duplicate entry;
- wrong pet;
- refresh creates another row.

### R3 — Ask reads the saved fact

Action:
- in Ask, ask what was recorded in the unique note.

Pass:
- answer is grounded in the saved record;
- no mutation/action card appears;
- source/subject is Pet A.

Block on:
- invented fact;
- wrong pet;
- mutation affordance;
- ungrounded factual success.

### R4 — Earliest/latest

Action:
- ask for Pet A's earliest relevant record;
- ask for Pet A's latest relevant record.

Pass:
- answers correspond to the file;
- limitation is acceptable if evidence is genuinely insufficient.

Block on:
- wrong endpoint;
- wrong pet;
- fabricated timestamp/value.

### R5 — Explicit UI edit

Action:
- edit the acceptance note through History;
- change the body to a second unique marker;
- refresh History;
- Ask for the current saved note.

Pass:
- History shows the corrected value;
- Ask uses the corrected value;
- stale value is not presented as current truth.

Block on:
- edit does not persist;
- old and new values both become effective;
- Ask prefers stale state.

### R6 — Explicit UI remove

Action:
- remove the acceptance note through History;
- refresh;
- ask about the removed note.

Pass:
- record is absent from effective History;
- Ask does not present the removed record as active saved state;
- a truthful no-current-record/limitation is acceptable.

Block on:
- removed row returns as effective state;
- Ask claims the removed fact is current.

### R7 — Second-pet isolation

Action:
- select/create Pet B;
- add a distinct Pet B note through UI;
- switch between Pet A and Pet B;
- ask a factual question for each pet;
- explicitly name the other pet while one is selected.

Pass:
- explicit names and selected context resolve to the correct owned pet;
- no record crosses pets;
- switching does not reuse stale subject authority.

Block immediately on any cross-pet read or write.

### R8 — Calculation is unavailable

Action:
- ask a clear arithmetic question such as an average over saved weights.

Pass:
- no numeric calculated result is published;
- response is a deliberate V1 limitation;
- no calculation action/effect is created.

Block on:
- any arithmetic answer presented as Furvise's computed fact.

### R9 — Ask mutation is unavailable

Action:
- tell Ask to save a note;
- ask it to edit/remove a saved record.

Pass:
- Ask does not change the ledger;
- no executable mutation card/suggestion is offered;
- UI History remains unchanged;
- deliberate V1 limitation is acceptable.

Block on any Ask-originated write.

### R10 — New Vet Brief is unavailable

Action:
- attempt normal navigation to start a new Vet Brief;
- attempt direct `/vet-brief` navigation without an existing brief ID.

Pass:
- new generation does not start;
- product explains unavailability;
- existing saved Brief access, if any, is not destructively changed.

Block on new generation/provider execution.

### R11 — Retry/idempotency

Action:
- perform one retained UI write and refresh immediately;
- repeat/retry the same browser action where the product naturally permits retry;
- reload an already-completed Ask conversation.

Pass:
- no duplicate care row;
- no duplicate committed Ask turn;
- no duplicate credit charge;
- durable result is reused where designed.

Block on duplicate effect or charge.

### R12 — Emergency terminal

Action:
- submit one clear current emergency symptom phrase using the dedicated test pet.

Pass:
- urgent action-first response appears;
- no mutation occurs;
- no historical record falsely reassures away the current emergency;
- normal provider/quota failure cannot intercept the emergency terminal path.

Block on diagnosis invention, mutation, or lost emergency handling.

## Observability capture

For every blocking failure record:
- wall-clock timestamp with timezone;
- preview deployment ID;
- page/route;
- pet selected;
- action/question;
- visible result;
- request/reference ID if displayed.

Do not record customer data or raw secrets.

After the run, inspect Vercel preview logs for the same time window:
- 5xx;
- provider failures;
- duplicate request IDs;
- settlement failures;
- unexpected Vet Brief provider activity;
- unexpected Ask action/suggestion execution.

## Exit criteria

Runtime acceptance passes only when R1-R12 are complete with no blocker.

After pass:
1. re-verify `main` has not moved;
2. re-verify rehearsal commit/tree identity;
3. fast-forward main to the rehearsal commit;
4. promote the already-tested rehearsal deployment artifact;
5. execute the minimal production smoke;
6. watch production errors immediately after promotion.

No H-M work is authorized by this gate.


## Browser access status

The exact rehearsal preview remains behind Vercel Deployment Protection.

Two independent browser attempts against the rehearsal host were redirected to Vercel login/SSO before Furvise loaded. A TinyFish default saved profile was also tested; no authenticated saved profile exists yet.

No credentials were entered and no application data was mutated.

Therefore R1-R12 remain explicitly unpassed. Do not infer runtime success from build/source/database evidence.

To execute R1-R12, use a persistent browser context already authenticated through the Vercel protection layer, then sign into Furvise with the dedicated acceptance account.


## Production acceptance evidence completed without persistent fixture changes

The following production checks are complete:

- deployment/domain cutover verified;
- no post-cutover runtime error group;
- authenticated QA history reader boundaries exercised;
- rollback-only UI database create/update/remove authority exercised;
- cross-account read denial exercised;
- QA entitlement and Ask allowance state verified.

All temporary write probes were rolled back and a follow-up query verified no probe row remained.

Still requiring browser/UI execution for full R1-R12 completion:
- visible UI add/edit/remove round-trip;
- Ask factual publication against the live HTTP application;
- calculation refusal through Ask;
- Ask mutation refusal through Ask;
- authenticated new-Vet-Brief refusal;
- browser-level retry/idempotency behavior;
- emergency terminal response.

The Opera connector established an authenticated Furvise production session but has been intermittently disconnecting between control calls. Do not convert that transport failure into a product failure.


## First live-smoke findings

The first live V1 smoke is **not a pass**. It found and triggered rollback for:
- arithmetic publication from an untyped/conversation path;
- supported earliest/latest history failing after candidate acquisition because of token-form mismatch.

Ask mutation refusal did pass: the QA request to save `V1ASKWRITE-20260925` returned the public-V1 mutation limitation with zero actions and released credit.

The corrected hotfix has passed the offline focused and security gates, but its two corrected behaviors still require a final live/app-layer recheck before declaring R1-R12 complete.
