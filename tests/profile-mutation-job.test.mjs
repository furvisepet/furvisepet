import { inspectAskWireContract } from "./helpers/ask-wire-contract.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isDeepStrictEqual } from "node:util";
import { bindFieldMutationJob, fieldMutationActionMatches, fieldMutationActionValue, fieldMutationJobProposal, readBoundFieldMutationJob } from "../app/lib/furvise-brain/field-mutation-job.ts";
import { validateAskRequest, askRequestProviderSchema } from "../app/lib/intelligence/ask-request-contract.ts";
import { prepareBoundFieldMutationAction, prepareFurviseApplicationActions } from "../app/lib/application-actions/planner.ts";
import { parseStoredApplicationActions } from "../app/lib/application-actions/contracts.ts";
import { prepareFieldMutationTurn } from "../app/lib/intelligence/field-mutation-turn.ts";
import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";
import { getFurviseActionPolicy } from "../app/lib/application-actions/policy.ts";
const pet = { id: "owned", name: "Subject", user_id: "owner", species: "dog" };
const source = text => ({ id: "user-turn", role: "user", text, createdAt: "2026-09-23T00:00:00Z" });
const context = text => ({ owner: { userId: "owner" }, pet, eligiblePets: [pet],
 currentMessage: text, currentTurn: source(text), conversationTurns: [], timeZone: "UTC" });
const proposal = (field, valueQuote, instructionQuote) => ({ domain: "pet_profile", operation: "set_field", petName: pet.name,
 field, valueQuote, instructionQuote: instructionQuote ?? "Apply " + valueQuote + " as requested." });
function request(p) { return { version: "ask-request.v2", mode: "update", question: p.instructionQuote,
 scope: "named", petNames: [pet.name], operation: "general", selection: "summary", quantity: null, topic: "",
 terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null,
 requirements: [], referenceTurnIds: [], fieldMutationJob: p }; }
function bound(p) { return validateAskRequest(request(p), context(p.instructionQuote)).request.fieldMutationJob; }
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const capabilityCode = read("app/lib/application-actions/capabilities.ts");
const ast = ts.createSourceFile("capabilities.ts", capabilityCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n)
 && ["rebindCanonicalCapabilityAction", "isExecutableSourceAction"].includes(n.name?.text)).map(n => n.getText(ast)).join("\n");
const capabilityBind = vm.runInNewContext(ts.transpileModule(functions.replace(/^export /gm,""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
 + "\nrebindCanonicalCapabilityAction", { bindFieldMutationJob, fieldMutationJobProposal, fieldMutationActionMatches,
 isDeepStrictEqual, getFurviseActionPolicy });
for (const [field, quote, expected] of [
 ["weight", "04.20 KGS", { kind: "weight", value: 4.2, unit: "kg" }],
 ["weight", "12 pounds", { kind: "weight", value: 12, unit: "lb" }],
 ["breed", "Mixed  terrier", { kind: "text", value: "Mixed  terrier" }],
 ["current_food", "Recipe A", { kind: "text", value: "Recipe A" }],
 ["name", "New Name", { kind: "text", value: "New Name" }],
 ["routine_note", "Walk  after lunch", { kind: "text", value: "Walk  after lunch" }],
 ["sex", "female", { kind: "sex", value: "female" }],
 ["sex", "not_sure", { kind: "sex", value: "not_sure" }],
]) test("one source-bound field primitive preserves " + field + ": " + quote, () => {
 const p = proposal(field, quote), before = structuredClone(p), job = bound(p);
 assert.deepEqual(job.value, expected); assert.equal(job.petId, pet.id);
 assert.equal(job.instruction.text.slice(job.valueSource.start, job.valueSource.end), quote);
 const prepared = prepareFieldMutationTurn(JSON.parse(JSON.stringify(job)), context(p.instructionQuote), "request");
 const action = prepared.action;
 assert.equal(action.input.field, field); assert.equal(action.input.value, fieldMutationActionValue(job));
 assert.equal(action.petId, pet.id); assert.equal(action.explicitIntent, false);
 assert.deepEqual(parseStoredApplicationActions([JSON.parse(JSON.stringify(action))])[0], action);
 const persisted = capabilityBind(action, "user-turn", { text: p.instructionQuote, createdAt: source("").createdAt }, pet.name, "owner");
 assert.deepEqual(persisted.fieldMutationJob, job); assert.equal(persisted.input.value, action.input.value);
 assert.deepEqual(p, before); assert.equal(prepared.orchestration.aiResult, null);
 assert.match(prepared.orchestration.answer.summary, /No profile change has been made/);
});
for (const [label, edit] of [
 ["foreign pet", (p,c) => { c.eligiblePets[0] = {...pet,user_id:"foreign"}; }],
 ["ambiguous pet", (p,c) => c.eligiblePets.push({...pet,id:"other"})],
 ["absent value", p => { p.valueQuote = "unquoted"; }],
 ["duplicate value", (p,c) => { c.currentMessage += " Recipe A"; c.currentTurn.text = c.currentMessage; }],
 ["value outside instruction", p => { p.instructionQuote = "Apply"; }],
 ["assistant source", (p,c) => { c.currentTurn.role = "furvise"; }],
 ["recovered source", (p,c) => { c.currentTurn.recoveredReceiptReference = true; }],
 ["different current message", (p,c) => { c.currentMessage = "unrelated"; }],
 ["unknown field", p => { p.field = "database_column"; }],
 ["model pet ID", p => { p.petId = "owned"; }],
 ["missing instruction", p => { p.instructionQuote = ""; }],
]) test("profile binding rejects " + label, () => {
 const p = proposal("current_food","Recipe A"), c = context(p.instructionQuote); edit(p,c);
 assert.throws(() => validateAskRequest(request(p),c), /ASK_REQUEST_INVALID/);
});
for (const value of ["0 kg","-2 kg","3","4 stones","NaN kg","Infinity lb","1e5 kg"])
 test("weight storage grammar rejects " + value, () => assert.throws(() => bound(proposal("weight",value)), /profile_mutation/));
test("unsupported sex and overlong or trimmed text cannot be silently reinterpreted", () => {
 for(const p of [proposal("sex","unknown"),proposal("breed","x".repeat(501)),proposal("name"," padded ")])
  assert.throws(() => bound(p), /ASK_REQUEST_INVALID/);
});
test("JSON re-entry rejects altered field, value, subject or source while preserving exact meaning", () => {
 const p = proposal("weight","4.2 kg"), job = bound(p), c = context(p.instructionQuote);
 assert.deepEqual(readBoundFieldMutationJob(JSON.parse(JSON.stringify(job))),job);
 for (const edit of [j=>j.petId="foreign",j=>j.value.value=9,j=>j.field="breed",
 j=>j.sourceMessageId="other",j=>j.valueSource.start++,j=>j.instruction.text+=" altered"]) {
  const changed = structuredClone(job); edit(changed);
  assert.throws(()=>prepareFieldMutationTurn(changed,c,"request"),/PROFILE_MUTATION|ASK_REQUEST_INVALID/);
 }
});
test("persisted capability cannot change the canonical field/value/subject or source", () => {
 const p = proposal("breed","Mixed terrier"), job = bound(p), original = prepareBoundFieldMutationAction(job,pet.name,"r");
 for (const edit of [a=>a.input.value="other",a=>a.input.field="name",a=>a.petId="foreign",
 a=>a.fieldMutationJob=undefined,a=>a.input.detail="unrelated"]) {
  const action=structuredClone(original);edit(action);
  assert.throws(()=>capabilityBind(action,"user-turn",{text:p.instructionQuote,createdAt:source("").createdAt},pet.name,"owner"),/FIELD_CAPABILITY/);
 }
 assert.throws(()=>capabilityBind(original,"user-turn",{text:"different",createdAt:source("").createdAt},pet.name,"owner"),/ASK_REQUEST_INVALID/);
});
test("reasoning cannot add or override a canonical profile action; proposal grants no auto execution", () => {
 const p=proposal("breed","Mixed terrier"),job=bound(p),action=prepareBoundFieldMutationAction(job,pet.name,"r");
 const conflicting={...action,input:{...action.input,field:"weight",value:"99 kg"},explicitIntent:true};
 assert.deepEqual(prepareFurviseApplicationActions({proposals:[conflicting],petId:pet.id,petName:pet.name,
 requestId:"r",sourceMessage:p.instructionQuote}),[]);
 assert.doesNotMatch(readFileSync(new URL("../app/lib/application-actions/planner.ts",import.meta.url),"utf8"),/hasDeterministicUserMutationIntent/);
 assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/AUTO_NOT_AUTHORIZED/);
 assert.equal(authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"confirm"}).mutation.kind,"update_profile");
 assert.equal(authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"cancel"}).mutation.kind,"cancel_pending");
 assert.deepEqual(job,bound(p));
});
test("profile mutation cannot compete with another job or factual request", () => {
 const p=proposal("breed","Mixed terrier");
 for (const extra of [{readTicket:{}},{appendJob:{}},{writeJob:{}},{lifecyclePlan:{}},{frame:{}},
 {evidenceBasis:"saved_profile"},{profileFields:["breed"]},{outputFormat:"json"},{mode:"mixed"},{selection:"latest"}])
 assert.throws(()=>validateAskRequest({...request(p),...extra},context(p.instructionQuote)),/profile_mutation_mixed/);
 const variants=askRequestProviderSchema({}).properties.request.anyOf;
 const mutation=variants.filter(v=>v.properties.version?.enum?.[0]==="ask-request.v2" && v.properties.fieldMutationJob?.anyOf?.some(branch=>branch.type==="object"));
 assert.equal(mutation.length,1);assert.equal(mutation[0].properties.readTicket.type,"null");
 assert.equal(mutation[0].properties.frame.type,"null");
});
test("route dispatch stops before retrieval/generation and legacy profile parser is absent", () => {
 const route=read("app/api/ask/route.ts");
 assert.ok(route.indexOf("prepareFieldMutationTurn(interpretation.request.fieldMutationJob") <
 route.indexOf("const planningSource = liveContext.currentTurn"));
 assert.match(route,/!\["pet.update_profile", "memory.set_preference", "memory.forget_preference", "pet.mark_deceased"/);
 assert.doesNotMatch(read("app/lib/application-actions/planner.ts"),/exactProfileUpdateCommand/);
 assert.doesNotMatch(route,/executeFurviseApplicationAction/);
 // Existing durable executor remains unsupported for profile writes; do not fake a success receipt.
 const sql=read("supabase/migrations/20260912042534_authorize_ask_actions_by_validated_turn_subject.sql");
 assert.doesNotMatch(sql,/v\.action_kind\s*=\s*'pet\.update_profile'/);
 assert.match(sql,/Unsupported mutation kinds never fall back/);
});

test("the single interpreter emits and binds profile semantics without a second provider call", async () => {
 const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
 const p=proposal("current_food","Recipe A"),c=context(p.instructionQuote);let calls=0;
 const interpreted=await interpretAskQuestion({context:c,model:"gpt-5.4-mini",client:{responses:{create:async r=>{
  calls++;assert.equal(calls,1);
  const schema=(await inspectAskWireContract(r,c)).canonicalSchema;
  assert.ok(JSON.stringify(schema).includes("fieldMutationJob"));
  return {output_text:JSON.stringify({request:request(p)})};
 }}}});
 assert.equal(calls,1);assert.deepEqual(interpreted.request.fieldMutationJob,bound(p));
 const prepared=prepareFieldMutationTurn(interpreted.request.fieldMutationJob,c,"request");
 assert.equal(prepared.action.input.field,"current_food");assert.equal(prepared.action.input.value,"Recipe A");
 assert.equal(prepared.orchestration.aiResult,null);
});

test("catalog intent remains a separate source-free provider branch",()=>{const branches=askRequestProviderSchema({}).properties.request.anyOf;const catalog=branches.filter(v=>v.properties.version?.enum?.[0]==="ask-catalog-intent.v1");assert.equal(catalog.length,1);assert.ok(catalog[0].properties.request);assert.equal(catalog[0].properties.calculatePlan,undefined);});
