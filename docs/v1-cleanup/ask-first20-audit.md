# Ask: first 20 files — code audit

## Issue 1 follow-up — owner-update interpretation

Deployed through PRs #283–#285; final production commit `20e1fd3fe9fa11ef97a82e1f45ded8f79d97a04e`, deployment `dpl_9T1JtCxZwowMfqTniK2e7631FjBf`. Issues 2–4 were not changed.

The interpreter now explicitly distinguishes new owner updates/action intent from non-writing supplied examples: update/mixed may use the existing null evidence basis when no saved facts are needed; action-only requests require a valid empty semantic frame; their scope identifies the owned target even without history retrieval. Evidence-basis, frame and scope conflicts receive at most one admitted re-interpretation, sharing the existing deadline/call budget. The validator still rejects these conflicts, foreign subjects, bad source references and invalid frames. No rejected contract is promoted into write authority.

Verification: 35 focused contract cases passed on the final changes (17 newly added), and 36 adjacent regression cases passed during this fix. Scoped lint and TypeScript checks passed; Vercel builds passed. No full local project suite was rerun.

| Live check | Result |
|---|---|
| Original seven-minute Clover save | Interpretation succeeds and proposes the correct action. Clicking Add to care history creates exactly one Clover entry; the successful receipt survives reload. |
| Original Archive Clover request | On the final deployment, reaches Review action and Confirm/Cancel. Cancel produces a stored `cancelled` capability; reload does not revive the action; Clover stays active. |
| Fictional nine-minute play example with no-save instruction | Explanation only; no action or care entry added. |

Intermediate results remain failures: the first evidence-basis fix exposed `ASK_REQUEST_CONTRACT_FRAME` for archive; the frame correction then exposed `ASK_REQUEST_CONTRACT_SCOPE`. These were distinct deployed revisions, not retries counted as first-attempt successes. The final scope correction resolved the tested archive request.

**Remaining save execution/copy gap:** the explicit save did not run automatically. It required the action button although the response said it was sending the update to history. Therefore the interpretation error is resolved in these cases, but automatic explicit-save completion is not certified. This requires follow-up without weakening authorization.

Evidence: save conversation `9fbe0587-fb31-4148-b024-d1649f664d91`; saved entry `f810d1b8-1b1c-4f4b-8fab-6ffc04e8bd9a`; final archive conversation `80554de5-864b-4e44-b38b-a78570847d6c`; fictional control `3155d249-d133-46de-94c7-5db8e738aca6`. Care-entry count increased from 3,729 to 3,730 solely for the deliberate save-action test.

## Production verification — 11 September 2026

**Live acceptance failed.** Five first-attempt prompts were submitted through the signed-in production app: two passed and three failed. No failed prompt was resubmitted. These results supersede any impression that the local checks established end-to-end readiness.

Approved rollout: PR #282 merged as `f0e164858419784c4021ebdb384e5b806a78e333`. Vercel deployment `dpl_4F1c6m8ZisWXYdvoKPNvCZuJTauZ` reached READY and owns `www.furvise.com`. The suggestion-transition migration was applied before rollout; production PostgreSQL confirms EXECUTE is denied to anon/authenticated and granted to service_role. The prior “not deployed” note below describes the earlier local verification stage.

Tests used the existing synthetic Clover profile, the real browser session, real API/model calls and production database reads. No mocked network responses or authentication were used.

| Scenario | Live result | Evidence |
|---|---|---|
| Fictional red=2/blue=3 counts, CSV only | Pass | Exact stored answer: `color,count\nred,2\nblue,3`; no capability detour. |
| Reload that answer | Pass, additional check | Visible conversation body identical before and after reload; database answer agrees. |
| Ask whether Vet Brief exports PDF; do not create one | Pass | Correct availability answer, with an optional preparation button; no action invoked. |
| Show Clover's profile AND explain fictional 2+3 | Fail | History fallback instead of either requested result. Trace: `ASK_HISTORY_REPAIR_INVALID`; initial output validation: `MISSING_READ_BODY`. Four provider calls. |
| Archive Clover, then cancel confirmation | Setup failed | HTTP 503; interpretation rejected with `ASK_REQUEST_CONTRACT_BASIS_UPDATE`. No action capability created, so Cancel could not be tested. Credit released. |
| Save Clover's seven-minute play session | Fail | HTTP 503 with the same interpretation-contract error. No care entry created. Credit released. |
| Recover a failed first turn | Partial | Failed conversations were absent from the already-loaded list until a full page reload. After reload, the failed save reopened with the original question and retry control. No retry performed. |

**Additional completion concern:** the compound-request fallback was stored with `finalStage=COMPLETED`, `creditDisposition=complete`, and no final error, despite `providerFailureClass=ASK_HISTORY_REPAIR_INVALID`. Treat this as an unresolved failure/credit-accounting contract issue, not a successful answer.

**Database outcome:** live care entries remained 3,729; Clover remained active; no action capabilities were created by this run. Conversation records for the five submitted prompts were retained as evidence.

**Not established by this run:** successful save/repeat-save/cross-pet-save behavior (initial save failed), cancellation persistence (proposal failed), monitor/dismiss behavior through the UI, native concurrent transitions, and pagination beyond 40 conversations/100 messages. The existing account's conversations did not reach those pagination boundaries. Earlier offline checks for these paths remain useful but are not live passes.

Reproduction conversations: CSV `dceb8218-e601-4ab4-9222-21b227738d4a`; PDF capability `8a9cc9d7-6c7d-4d4a-9e67-f6ca11b18e89`; compound request `83dbac36-bd30-4a4e-b6c2-c7c52a49fc27`; archive `00c9cd44-c157-44e3-9030-2164dd1cc294`; save `0866ffb8-808b-4b8d-ba32-571d7241b489`.

Next repair priorities are the interpretation contract for explicit mutations, mixed navigation/question handling through the full pipeline, unsuccessful-fallback completion/credit policy, and conversation-list refresh after a failed first turn. Validation and write-authorization checks must remain intact while correcting these failures.

## Repair verification — 11 September 2026

The repairs for F1–F9 pass the focused checks below. Verification covers the original 20 application files, two directly changed conversation helpers, and the suggestion-transition migration. Fourteen of the 20 application files required edits; six were reviewed without unnecessary changes. No full-project test suite or build was rerun for this verification pass.

| Check | Result | Scope and evidence |
|---|---|---|
| Focused regression tests | 245 passed; 0 failed or skipped | 23 relevant test files, including 16 new executable regression cases in `tests/ask-first20-reliability.test.mjs`. Existing suites also contain source assertions; the count is not 245 end-to-end scenarios. |
| ESLint | No errors or warnings | Original 20 files plus the two changed conversation helpers. |
| TypeScript | No diagnostics | Options/global diagnostics and syntactic/semantic diagnostics for the 22 scoped source files, resolving their imports. |
| Browser interactions | Passed | Actual Ask page with mocked authentication/network: old conversation deep link, one cancellation request, earlier messages, history pagination, reversed conversation responses, and escaped HTML. |
| Browser reload | Passed | Old deep link and cancelled action survive reload against the fixture's stored response. This does not exercise a deployed database. |
| Mobile layout | Passed overflow check | At 390px, document width equals viewport width. Screenshot inspected; the isolated fixture does not serve the production logo asset. |
| Suggestion SQL | Passed | PostgreSQL 18.3 through PGlite 0.5.8; 103 migrations loaded and `supabase/tests/ask_suggestion_transitions.sql` executed. Includes freshness, ownership, terminal states, service-only grants and injected rollback. |
| Diff whitespace | Clean | `git diff --check`. |

**Repairs:** Existing-save acknowledgements now require one live receipt for the immediately preceding owner turn and the selected pet. Final answer persistence retries and reads back a verified durable response on failure; reviewed prose is no longer rewritten after review. Capability questions and compound navigation preserve their intent. Cancel reaches the server, stale conversation loads cannot replace newer selections, and suggestion status follows the canonical result. Monitor/dismiss transitions are transactional. Conversation and message pagination restore access to older history, and read failures return explicit errors. Additional hardening preserves urgent instructions, rejects incomplete provider output items, separates history eligibility from presentation depth, and contains optional telemetry failures.

**Limits:** These results support the exercised behavior, not a fault-free or “10/10” certification. Live model quality, deployed authentication/PostgREST, and native multi-connection PostgreSQL concurrency remain unverified. The new migration must be applied before deploying the route that calls `transition_ask_suggestion`; it has not been deployed here.

The original audit and scores below are retained as a **before-repair baseline**. Its line numbers, findings, recommendations and diagnostic harness describe the base commit, not the repaired working tree. Use the regression tests above for current acceptance; the historical harness deliberately asserts old defects.

## Original audit — before repairs

Reviewed 10 September 2026 against commit `d2a3d7c8bba70cd0ed238e655282f8d3328bd36a`.

**Overall judgment: 6.5/10.** The architecture has useful authority boundaries, structured provider handling, and substantial regression coverage. However, ordinary save, cancellation, history-loading and fallback paths still contain correctness gaps. This batch does not yet meet the “boringly reliable” goal.

**Scope and method.** These are the first 20 Ask application files in the existing `docs/v1-cleanup/file-categories.csv` inventory order: 7,104 lines. Each file was read, and relevant callers, persistence helpers, SQL migrations and tests were traced. Dependencies outside these 20 were inspected to verify findings; they are not included in the file ratings. This is a source audit plus offline execution, not a live production or veterinary-quality evaluation.

**Rating scale.** Scores are engineering judgments about correctness, authorization boundaries, failure handling, maintainability and meaningful test coverage. 9 means strong within the reviewed scope; 8 means sound with limited concerns; 7 means usable but needs hardening; 6 means material reliability gaps; 5 means important correctness problems; 4 means an owner needs substantial correction. Small files earn their score through a clear, correct responsibility, not their size. The overall rating weights the central request and user flows more heavily than tiny helpers; it is not an arithmetic average or an accuracy percentage.

| # | File | Lines | Rating | Assessment |
|---|---|---:|---:|---|
| 1 | `app/api/ask/actions/[messageId]/route.ts` | 39 | 8/10 | Thin, bounded endpoint. Delegates exact action execution to the capability authority; owner/message binding is preserved. |
| 2 | `app/api/ask/conversations/[id]/messages/route.ts` | 73 | 7/10 | Input limits and transactional exchange authority are useful. Client-supplied presentation remains a separate trust boundary; database read errors are currently conflated with unavailable conversations. |
| 3 | `app/api/ask/conversations/[id]/route.ts` | 95 | 6/10 | Ownership checks and reload reconciliation are useful. Some read failures silently become missing data; message loading has no explicit pagination/completeness contract. |
| 4 | `app/api/ask/conversations/route.ts` | 176 | 6/10 | Good bounded creation and idempotency. Latest-40-only listing and assistant-only filtering interact poorly with reopening and failed first turns. F9. |
| 5 | `app/api/ask/route.ts` | 2,605 | 5/10 | Strong checks exist, but early shortcuts and optional finalization weaken end-to-end correctness. Excessive responsibilities make ordering defects hard to reason about. F1, F2, F3. |
| 6 | `app/api/ask/suggestions/[id]/route.ts` | 271 | 5/10 | Save RPC provides a solid transactional foundation. Dismiss and monitor do not uphold the same result/freshness contract. F7, F8. |
| 7 | `app/ask/layout.tsx` | 8 | 8.5/10 | Appropriate thin private-page composition. No material defect identified in this wrapper. |
| 8 | `app/ask/page.tsx` | 911 | 5/10 | Thoughtful retry and draft support, but independent asynchronous flows can disagree with server state. F5, F6, F7, F9. |
| 9 | `app/components/ask-answer-text.tsx` | 31 | 8.5/10 | Small renderer using React text rendering and shared parsing. Clear ownership; no material defect identified in the reviewed rendering paths. |
| 10 | `app/components/ask-usage-notice.tsx` | 34 | 8/10 | Focused allowance-exhaustion presentation. Usage-experience assertions pass; no material defect identified. |
| 11 | `app/lib/ai/ask-answer-economy.ts` | 556 | 6.5/10 | Useful format preservation and prose handling. Lexical classification, deduplication, and history-offer eligibility are coupled to presentation depth. Needs mixed-intent behavior coverage. |
| 12 | `app/lib/ai/ask-command-router.ts` | 94 | 6/10 | Simple explicit language commands work. Navigation recognition accepts compound requests and assumes the selected pet. F4. |
| 13 | `app/lib/ai/ask-error-diagnostic.ts` | 10 | 9/10 | Small allowlist for public diagnostic stages, with a safe fallback. Clear and easy to verify. |
| 14 | `app/lib/ai/ask-internal-product-policy.ts` | 63 | 4/10 | Export keywords conflate output requests with feature availability. Its route consumer still emits obsolete capability copy. F3. |
| 15 | `app/lib/ai/ask-orchestrator.ts` | 170 | 7.5/10 | Useful generation seam and grounded suggestion checks. Concern selection and presentation-depth gating need continued cross-intent coverage. |
| 16 | `app/lib/ai/ask-provider.ts` | 127 | 8/10 | Explicit incomplete/refused/failed/invalid states; parsing failures cannot report provider success. Missing status defaults to completed, which is a defensive-contract concern rather than a demonstrated production failure. |
| 17 | `app/lib/ai/ask-reasoning.ts` | 1,585 | 6.5/10 | Strong evidence coverage, bounded provider calls and repair machinery. Context selection, prompts, parsing, retries and presentation remain one large owner; lenient normalization increases reliance on downstream validation. |
| 18 | `app/lib/ai/ask-turn-model.ts` | 210 | 8/10 | Useful typed lifecycle and optional-failure telemetry. Treat it as instrumentation, not the authority enforcing valid state transitions. |
| 19 | `app/lib/ai/config.ts` | 9 | 8/10 | Clear model/timeout/output constants. Shared non-Ask budget names are a minor ownership issue, not a reason to delete it. |
| 20 | `app/lib/ai/context-builder.ts` | 37 | 7.5/10 | Tenant/pet-scoped queries with explicit failure. Active-concern retrieval lacks an explicit result-bound/coverage contract; recent resolved selection is deliberately limited. |

**Findings, ordered by impact.** P1 means a material correctness problem to address before expanding Ask; P2 means a reproducible interaction defect or a well-supported failure-path gap. No production incident frequency is inferred from this audit.

**F1 — P1: a new save can be acknowledged using an unrelated older saved recovery.**

Location: `app/api/ask/route.ts:1405`, with the early branch at line 429 and confirmation text at line 1345.

`findExistingCareEventForSaveRequest` accepts broad save/history wording, then searches backwards for any prior user turn containing words such as “better” or “fine”. It looks for a care entry attached to that older turn. It does not establish that the current request refers to that event or the same subject. The route selects this result before normal subject resolution and interpretation.

Offline reproduction: an older “Milo is eating better” turn has a saved entry. The current request is “Please save that Luna missed breakfast to her history”. The actual helper returns `alreadyPersisted: true`, the old entry ID and `recently_resolved`. The route's corresponding answer is “Yes, that improvement is already in Milo's history.” The newly requested event can therefore be skipped while success is asserted. This demonstrates incorrect event matching; it does not demonstrate a cross-account write.

Required correction: only acknowledge an existing save after resolving the current reference to that exact source event and pet. Acceptance check: a genuinely repeated save reuses its receipt, while a new observation or different pet is processed as a new request.

**F2 — P1: the final answer returned to the client is not guaranteed to be the answer saved for reload.**

Location: `app/api/ask/route.ts:1569`, `:1810`, `:1817`; authority implementation: `supabase/migrations/20260903203626_add_ask_conversation_service_authority.sql:597`.

The route first completes the assistant message. Later it reconciles save-related copy, attaches actions and completes the turn snapshot. Saving that final response is wrapped in an optional subsystem: a false RPC result or exception is logged and swallowed. The route still returns the newer canonical response with `saved: true`. The SQL function confirms that this second operation updates the actual stored response and care-persistence metadata; it is not merely analytics.

Evidence: source and SQL failure-path trace, not a live database fault injection. Under finalization failure, the initial persisted response can survive while the client receives different text/metadata. Reload reconciliation can repair some related action/suggestion state, but does not guarantee the identical final answer body.

Required correction: make final response persistence part of successful completion, with bounded idempotent recovery. Acceptance check: inject finalization failure and verify either identical durable/replayed output or an explicit recoverable outcome, without duplicate effects or charges.

**F3 — P2: output-format requests can trigger stale product-capability answers.**

Location: `app/lib/ai/ask-internal-product-policy.ts:14`; consumers: `app/api/ask/route.ts:875` and `:2565`.

Direct execution classifies “Export Milo's weight records as CSV” as `vet_prep_exports`. It is an output request, not necessarily a question about a paid report feature. The route can replace a generated answer with the planned-capability response when reasoning exists, safety is normal, and shopping is not suppressed. Those conditions matter: this audit does not claim every history export is intercepted.

The fallback also says exportable vet-prep reports are not built and advertises Results/static product suggestions as available. The repository contains the Vet Brief PDF route and records the Results implementation as retired. Current capability copy and actual features have drifted apart.

Required correction: distinguish feature-availability questions from requested serialization, and derive availability from the current feature owner. Acceptance checks: CSV requests preserve their task; actual PDF/capability questions get truthful current availability without the retired catalogue copy.

**F4 — P2: deterministic navigation silently drops the rest of a compound request.**

Location: `app/lib/ai/ask-command-router.ts:17`; route shortcut: `app/api/ask/route.ts:590`.

Direct execution of “Show Milo's profile and explain his weight trend” returns a provider-independent navigation result: “Open Milo's profile below.” The regex only requires an opening navigation verb and one target anywhere in the message. The second obligation is lost. Navigation proposals also use `target: selected`, so named-pet commands need identity resolution before this shortcut can be trusted.

Required correction: use this shortcut only for unambiguous standalone commands with a resolved subject. Acceptance checks: compound requests retain all obligations; asking for another pet's profile never silently selects the current pet.

**F5 — P2: Cancel closes review but never cancels the pending action.**

Location: `app/ask/page.tsx:715`, Cancel handler at line 740.

The Cancel button exists only while confirmation is open. Its handler checks `confirming` and closes that view. The branch that calls `decide("cancel")` cannot be reached from the rendered button. Executing the actual extracted component with a state/JSX harness reproduced Review → Cancel → Review, with zero cancellation calls. The capability remains pending. This does not mean cancellation executes the destructive action; the defect is the missing durable cancellation.

Required correction: distinguish closing a review from cancelling the proposed action, and connect the latter to server cancellation. Acceptance check: cancelling yields a persisted cancelled status and the action remains cancelled after reload.

**F6 — P2: slower conversation loads can overwrite the last selected conversation.**

Location: `app/ask/page.tsx:241`.

`openConversation` blocks active Ask submissions but does not identify or cancel competing history reads. Both completions can update pet, URL, thread and selected conversation. The history picker remains available during the read. An offline execution of the actual function started A, then B; B completed first, A completed last. The final displayed selection was A even though B was clicked last.

Required correction: apply a request-generation guard across all post-fetch state changes, or abort and ignore obsolete loads. Acceptance check: resolving A after B cannot overwrite B's thread, pet, URL or loading state.

**F7 — P2: dismiss can contradict a saved suggestion's canonical state.**

Location: `app/ask/page.tsx:526`; server dismiss branch: `app/api/ask/suggestions/[id]/route.ts:123`.

The server explicitly returns `already_applied` when the suggestion was already saved. The UI handles a dismiss request by setting `dismissed` regardless of that returned status. The actual handler, supplied a successful `already_applied` response and care-entry ID, reproduced a dismissed UI state.

There is a second gap in the same operation: the server's pending-only update checks only the error, not whether a row changed. A concurrent save after the initial read can produce zero updated rows followed by “Not saved.” This race is source-traced rather than exercised against a database.

Required correction: render the returned canonical state and make the dismiss result conditional on the row transition. Acceptance check: save-versus-dismiss races consistently show the saved receipt or a confirmed dismissal.

**F8 — P2: monitoring is a separate, partially committable write path.**

Location: `app/api/ask/suggestions/[id]/route.ts:137`.

Monitor updates an eligible concern, then separately marks the suggestion saved. It checks query errors but not the concern update's affected-row count. It also does not require the suggestion to be pending before this path. A stale concern can yield no update but a monitoring success response; a second-write failure can leave a changed concern with an unsettled suggestion. Separate idempotency wrappers do not make these two writes atomic across operation types.

Evidence: source-traced failure/concurrency conditions. The current reviewed suggestion card does not expose a Monitor button, so this is an authenticated endpoint reliability issue, not a demonstrated everyday UI flow.

Required correction: if retained, place monitor's validation, conditional state change and receipt in one transaction. Otherwise establish that the endpoint action is unused before removing it. Acceptance checks: stale/dismissed suggestions, simultaneous resolution, and a failed second write cannot report false success.

**F9 — P2: older and first-turn-failed conversations can become inaccessible through normal history loading.**

Location: `app/api/ask/conversations/route.ts:17`; deep-link check: `app/ask/page.tsx:180`.

The history list returns the latest 40 conversations and requires an assistant message. There is no continuation cursor. Initial page loading only opens a requested conversation if it appears in that list. A valid link to conversation 41 is therefore ignored even though the detail endpoint can retrieve it. A newly created conversation whose first answer failed is excluded by the assistant-message join, weakening the available retry/recovery path after reload.

Evidence: API query and UI control-flow trace; a 41-conversation live account was not created. This is an access/discoverability defect, not evidence that stored conversations are deleted.

Required correction: load valid requested IDs independently of the recent list; expose pagination and a deliberate failed-turn recovery policy. Acceptance checks: the 41st conversation opens by URL and a failed first turn remains recoverable after reload.

**Additional observations, not counted as confirmed defects.**

- Conversation-detail loading maps a conversation lookup error to 404 and discards some suggestion/receipt query errors. Distinguish missing records from temporary inability to read them.
- Conversation messages are requested in ascending order without an explicit pagination or completeness contract. A configured API row cap could truncate long threads; the deployed cap was not verified, so no specific truncation threshold is asserted.
- Answer economy controls `allowsAutomaticHistory`, and reasoning/orchestration use that to suppress history proposals. Presentation depth consequently affects suggestion eligibility. Keep factual/write decisions independently owned even if the final display remains shared.
- The request route and reasoning owner together contain 4,190 lines, about 59% of this batch. Their risk is responsibility density and ordering, not simply line count. Merging additional semantic, persistence or authorization owners into these files would make this harder to maintain.

**What is already worth keeping.**

Capability-only action execution, tenant-scoped reads, bounded request bodies, transactional exchange authority, idempotent save RPCs, explicit provider terminal states, evidence coverage tracking, deadline budgeting, and separate factual review are useful foundations. The audit did not establish an ownership bypass in the reviewed action endpoint. This is not a full security certification.

**Validation performed.**

- `npm run typecheck`: passed, exit 0.
- Focused existing tests: 153 passed, 0 failed, 0 skipped. Coverage included action capabilities, conversation authority, command routing, suggestions, inflight navigation, completion, turn lifecycle, context reasoning, answer economy, rendering, error UX, usage, credit settlement and structured provider output.
- Six new offline diagnostic probes reproduced F1, F3, F4, F5, F6 and the UI portion of F7. These probes intentionally assert the observed defective behavior; they are evidence of gaps, not six successful product acceptance tests.
- F2, F8, F9 and the server race in F7 were established by source/control-flow inspection. No live provider calls, database mutations or browser end-to-end run were performed for this batch. Historical full-suite results were not represented as a fresh full-suite run.
- Several relevant tests assert strings/regexes in source or SQL. Other tests execute real functions. The existing green suite therefore does not substitute for state-transition, failure-injection and concurrent-interaction tests.

**Recommended next work.**

Fix F1 and F2 first so acknowledgements and stored answers can be trusted. Then close the UI/server result gaps in F5–F8, correct routing/capability truthfulness in F3–F4, and restore reliable history access in F9. Add behavior tests for each failure before further consolidation. Keep evidence validation and write authorization separate; further file reduction should follow stable responsibility boundaries.

Application source was not modified during this audit.

**Reproduction harness.** Run the following CommonJS script from the repository root with its installed TypeScript dependency. It extracts the actual named functions from the audited source and supplies minimal offline dependencies. It does not reproduce a browser, SQL locking, authentication or a full HTTP request.

```javascript
const fs=require('node:fs'); const vm=require('node:vm'); const assert=require('node:assert/strict');
const root=process.cwd();
const ts=require(root+'/node_modules/typescript');
function extract(path,name,globals={}) {
 const source=fs.readFileSync(root+'/'+path,'utf8'); const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 let found; function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,walk);}walk(ast); assert.ok(found,name);
 const compiled=ts.transpileModule(found.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 return vm.runInNewContext(compiled+'\n'+name,globals);
}
(async()=>{
 const findings=[];
 const policy=await import(root+'/app/lib/ai/ask-internal-product-policy.ts');
 const command=await import(root+'/app/lib/ai/ask-command-router.ts');
 const q="Export Milo's weight records as CSV";
 assert.equal(policy.classifyFurviseCapabilityQuestion(q),'vet_prep_exports');
 findings.push({probe:'capability false positive',input:q,actual:policy.classifyFurviseCapabilityQuestion(q)});
 const mixed="Show Milo's profile and explain his weight trend";
 const routed=command.planDeterministicAskCommand(mixed,'Milo');
 assert.equal(routed.orchestration.handledWithoutAi,true);
 findings.push({probe:'compound navigation loses question',input:mixed,actual:routed.orchestration.answer.summary});
 const lookup=extract('app/api/ask/route.ts','findExistingCareEventForSaveRequest');
 const query={};for(const method of ['select','eq','order','limit'])query[method]=()=>query;
 query.maybeSingle=async()=>({data:{id:'older-recovery-entry',concern_id:null},error:null});
 const result=await lookup({context:{conversationTurns:[{id:'old-turn',role:'user',text:'Milo is eating better'}]},currentSourceMessageId:'new-turn',message:"Please save that Luna missed breakfast to her history",petId:'milo',userId:'owner',supabase:{from:()=>query}});
 assert.equal(result.alreadyPersisted,true);
 findings.push({probe:'new save misidentified as prior recovery',actual:result});
 let slots=[],cursor=0,calls=[];
 const React={createElement:(type,props,...children)=>({type,props:props||{},children})};
 const card=extract('app/ask/page.tsx','ApplicationActionCard',{React,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v]},secondaryButton:'',quietButton:'',dangerButton:''});
 const action={id:'pending-action',status:'pending',confirmationPolicy:'always',safetyClass:'DESTRUCTIVE',label:'Delete',description:'Review'};
 function render(){cursor=0;return card({action,onAction:async(_,decision)=>calls.push(decision)})}
 function button(tree,label){if(!tree||typeof tree!=='object')return null;if(tree.type==='button'&&tree.children.includes(label))return tree;for(const c of tree.children||[]){const found=button(c,label);if(found)return found;}return null;}
 button(render(),'Review action').props.onClick(); button(render(),'Cancel').props.onClick();
 assert.equal(calls.length,0);assert.ok(button(render(),'Review action'));
 findings.push({probe:'Cancel does not cancel capability',serverDecisions:calls,pendingCardStillRendered:true});
 const pending=new Map();let active=null;const noop=()=>{};
 const open=extract('app/ask/page.tsx','openConversation',{conversations:[{id:'A'},{id:'B'}],askRequestActiveRef:{current:false},saveCurrentDraft:noop,setError:noop,setStatus:noop,setLoading:noop,dismissOnboardingEntry:noop,conversationJson:url=>new Promise(resolve=>pending.set(url.split('/').at(-1),resolve)),parseConversationDetail:()=>[],setSelectedPet:noop,window:{localStorage:{}},persistActivePetId:noop,replaceAskLocation:noop,setActiveConversationId:id=>active=id,setThread:noop,setFailedRequest:noop,setQuestion:noop,readAskDraft:()=>'',setHistoryOpen:noop,trackAskEvent:noop,requestAnimationFrame:noop});
 const a=open('A'),b=open('B');pending.get('B')({conversation:{id:'B',petId:'pet-B'}});await b;pending.get('A')({conversation:{id:'A',petId:'pet-A'}});await a;assert.equal(active,'A');
 findings.push({probe:'out-of-order conversation load',lastClicked:'B',displayed:active});
 let state=[];
 const apply=extract('app/ask/page.tsx','applyStateSuggestion',{setThread:fn=>state=fn(state),updateMessageSuggestion:(current,id,sid,patch)=>[...current,patch],suggestionJson:async()=>({status:'already_applied',careEntryId:'saved-entry'}),updateMessageSuggestionIfSaving:current=>current});
 await apply('message',{id:'suggestion'},'dismiss');assert.equal(state.at(-1).status,'dismissed');
 findings.push({probe:'dismiss ignores saved server result',serverStatus:'already_applied',uiStatus:state.at(-1).status});
 console.log(JSON.stringify({sourceCommit:'d2a3d7c8bba70cd0ed238e655282f8d3328bd36a',method:'Actual functions extracted with TypeScript AST, executed offline with mocked external dependencies; command/policy imported directly.',probes:findings},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
```
