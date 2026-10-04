import { bindCancellationSelector } from "../furvise-brain/lifecycle-plan.ts";
import { ownerDeclinesPersistence } from "../ai/owner-assertion.ts";
import { readWriteSourceSemantics } from "../furvise-brain/source-semantics.ts";
import { getActiveAiAdmission } from "../ai/usage-guard/context.ts";
import { createHash, randomUUID } from "node:crypto";
import { explicitlyNamedOwnedPets, ownedPetIdentityKey } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext } from "./types.ts";

export const CATALOG_INTENT_VERSION = "ask-catalog-intent.v1";
export const CATALOG_PURPOSES = ["replace", "remove", "concern", "lifecycle", "receipt"] as const;
export type CatalogPurpose = typeof CATALOG_PURPOSES[number];
export type CatalogContext = Pick<FurviseLiveContext, "owner" | "pet" | "eligiblePets" | "currentMessage" | "currentTurn" | "conversationTurns" | "conversationId">;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
const fail = (field: string): never => { throw new Error("ASK_CATALOG_INVALID:" + field); };
export const catalogDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalized = ownedPetIdentityKey;

/** Identity-only veto. Scope labels cannot erase an explicitly unresolved owned name. */
export function assertUnambiguousOwnedIdentity(context: Pick<CatalogContext, "eligiblePets" | "owner" | "currentMessage">): void {
  const owned = context.eligiblePets.filter(p => p.user_id === context.owner.userId);
  for (const pet of explicitlyNamedOwnedPets(context.currentMessage, owned)) {
    if (owned.filter(other => normalized(other.name || "") === normalized(pet.name || "")).length !== 1)
      fail("ambiguous_subject");
  }
}

/** Distinct proposal, never an executable job. Only the target slot may be unresolved. */
export function catalogIntentSchema(request: object) {
  const properties = {
    version: { type: "string", enum: [CATALOG_INTENT_VERSION] },
    sourceTurnId: { type: "string", minLength: 1, maxLength: 160 },
    instructionQuote: { type: "string", minLength: 1, maxLength: 1600 },
    authorizationQuote: { type: "string", minLength: 1, maxLength: 1600 },
    purpose: { type: "string", enum: CATALOG_PURPOSES },
    scope: { type: "string", enum: ["subjects", "owner_receipt"] },
    ownerScope: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      required: ["basis", "sourceTurnId", "quote"], properties: {
        basis: { type: "string", enum: ["explicit_owner_receipts"] },
        sourceTurnId: { type: "string", minLength: 1, maxLength: 160 },
        quote: { type: "string", minLength: 1, maxLength: 1600 },
      } }] },
    subjects: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false,
      required: ["petName", "sourceTurnId", "quote", "basis"], properties: {
        petName: { type: "string", minLength: 1, maxLength: 100 },
        sourceTurnId: { type: "string", minLength: 1, maxLength: 160 },
        quote: { type: "string", minLength: 1, maxLength: 1600 },
        basis: { type: "string", enum: ["named", "selected", "dialogue"] },
      } } }, request,
  };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

export type CatalogIntent = Readonly<{
  version: typeof CATALOG_INTENT_VERSION; purpose: CatalogPurpose;
  sourceTurnId: string; instructionQuote: string; authorizationQuote: string;
  scope: "subjects" | "owner_receipt"; ownerScope: JsonObject | null; subjects: readonly JsonObject[]; request: JsonObject;
}>;
export type CatalogPermit = Readonly<{
  id: string; ownerId: string; requestId: string; sourceTurnId: string; sourceHash: string;
  intentHash: string; subjectIds: readonly string[]; purpose: CatalogPurpose;
  scope: CatalogIntent["scope"]; conversationId: string; pendingScope: "current_conversation" | null; cutoff: string; expiresAt: number;
  maxRows: number; maxBytes: number;
}>;
type PermitState = { operationId: string; identity: string; intent: CatalogIntent; context: CatalogContext;
  phase: "bound" | "hydrating" | "hydrated" | "continuing" | "bound_target"; catalogHash?: string };
const issued = new WeakMap<CatalogPermit, PermitState>();
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function span(text: string, quote: unknown) {
  if (typeof quote !== "string" || !quote.trim() || quote.length > 1600) return fail("source_span");
  const start = text.indexOf(quote);
  if (start < 0 || text.indexOf(quote, start + 1) >= 0) return fail("source_span");
  return { start, end: start + quote.length, text: quote };
}
function sourceIdentity(context: CatalogContext) {
  const source = context.currentTurn;
  if (!source || source.role !== "user" || source.recoveredReceiptReference || source.text !== context.currentMessage
    || !Number.isFinite(Date.parse(source.createdAt))) return fail("current_user");
  return { id: source.id, text: source.text, createdAt: source.createdAt };
}
/** No IO and no authority derived from model-provided IDs, confidence or catalog contents. */
export function bindCatalogIntent(value: unknown, context: CatalogContext, requestId: string, expiresAt: number) {
  if (!object(value) || Object.keys(value).sort().join() !== "authorizationQuote,instructionQuote,ownerScope,purpose,request,scope,sourceTurnId,subjects,version"
    || value.version !== CATALOG_INTENT_VERSION || !CATALOG_PURPOSES.includes(value.purpose as CatalogPurpose)
    || !["subjects", "owner_receipt"].includes(String(value.scope)) || !Array.isArray(value.subjects)
    || value.subjects.length > 20 || !object(value.request) || !requestId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return fail("shape");
  const admission = getActiveAiAdmission();
  if (!admission) return fail("admission_required");
  admission.assertCatalogPlanningPhase();
  const source = sourceIdentity(context);
  if (!context.conversationId) return fail("conversation_identity");
  if (value.sourceTurnId !== source.id || value.instructionQuote !== source.text.trim()) return fail("source_identity");
  span(source.text, value.authorizationQuote);
  assertUnambiguousOwnedIdentity(context);
  const owned = context.eligiblePets.filter(p => p.user_id === context.owner.userId);
  const subjectGroundings = value.subjects;
  const subjectIds = subjectGroundings.map(item => {
    if (!object(item) || Object.keys(item).sort().join() !== "basis,petName,quote,sourceTurnId"
      || typeof item.petName !== "string" || !["named", "selected", "dialogue"].includes(String(item.basis))) return fail("grounding");
    const turn = item.sourceTurnId === source.id ? context.currentTurn : context.conversationTurns.find(t => t.id === item.sourceTurnId);
    if (!turn || turn.role !== "user" || turn.recoveredReceiptReference || item.basis !== "dialogue" && turn.id !== source.id) return fail("grounding_source");
    const quoted = span(turn.text, item.quote);
    const matches = owned.filter(p => normalized(p.name || "") === normalized(item.petName as string));
    if (matches.length !== 1) return fail("subject_ownership");
    const pet = matches[0];
    if (item.basis === "selected") {
      if (pet.id !== context.pet.id || explicitlyNamedOwnedPets(source.text, owned).some(p => p.id !== pet.id)) return fail("selected_contradiction");
    } else if (!explicitlyNamedOwnedPets(quoted.text, owned).some(p => p.id === pet.id)) return fail("subject_span");
    return pet.id;
  });
  if (new Set(subjectIds).size !== subjectIds.length) return fail("duplicate_subject");
  const p = value.request;
  if (p.version !== "ask-request.v2" || !Array.isArray(p.petNames) || !Array.isArray(p.requirements)) return fail("frozen_request");
  if (value.scope === "owner_receipt") {
    // Owner-wide scope is an affirmative source-grounded purpose, never a failed-subject fallback.
    const ground = value.ownerScope;
    if (!object(ground) || Object.keys(ground).sort().join() !== "basis,quote,sourceTurnId"
      || ground.basis !== "explicit_owner_receipts" || ground.sourceTurnId !== source.id
      || explicitlyNamedOwnedPets(source.text, owned).length || !Array.isArray(p.excludedPetNames)
      || p.excludedPetNames.length) return fail("owner_scope_grounding");
    span(source.text, ground.quote);
    if (value.purpose !== "receipt" || subjectIds.length || p.petNames.length || p.scope !== "none"
      || !object(p.storedRead) || p.storedRead.scope !== "owner") return fail("owner_receipt_scope");
  } else {
    if (value.ownerScope !== null) return fail("owner_scope_grounding");
    const cancellation = object(p.lifecyclePlan) && object(p.lifecyclePlan.pendingDisposition)
      ? bindCancellationSelector(p.lifecyclePlan.pendingDisposition, context, subjectIds) : null;
    const unqualified = value.purpose === "lifecycle" && cancellation?.selector.petNames === null
      && object(p.lifecyclePlan) && p.lifecyclePlan.transition === null && p.lifecyclePlan.requiredSubjectState === null && p.scope === "none";
    if ((!subjectIds.length && !unqualified) || p.petNames.length !== subjectIds.length
      || p.petNames.some(name => !subjectGroundings.some((s: JsonObject) => s.petName === name))
      || explicitlyNamedOwnedPets(source.text, owned).some(pet => !subjectIds.includes(pet.id))) return fail("scope_contradiction");
  }
  if (value.purpose !== "receipt" && ownerDeclinesPersistence(source.text)) return fail("persistence_veto");
  const expectedJob = { replace: "writeJob", remove: "removeJob", concern: "stateTransitionJob", lifecycle: "lifecyclePlan", receipt: "storedRead" }[value.purpose as CatalogPurpose];
  const job = p[expectedJob];
  if (!object(job)) return fail("typed_purpose");
  for (const key of ["writeJob", "removeJob", "stateTransitionJob", "lifecyclePlan", "storedRead", "appendJob", "fieldMutationJob", "task", "calculatePlan"])
    if (key !== expectedJob && p[key] != null) return fail("mixed_catalog_operation");
  if (value.purpose !== "lifecycle" && (p.readTicket != null || p.mode === "mixed")) return fail("mixed_catalog_operation");
  if (value.purpose === "replace" || value.purpose === "remove") {
    if (subjectIds.length !== 1 || job.petName !== p.petNames[0] || job.instructionQuote !== source.text.trim()
      || job.target !== null || job.operation !== value.purpose || value.purpose === "remove" && job.domain !== "care_history") return fail("unbound_target");
    if (value.purpose === "replace") {
      const body = span(source.text, job.bodyQuote);
      if (job.semantics !== undefined && readWriteSourceSemantics(job.semantics) === null) return fail("source_semantics");
      if (!Array.isArray(job.constraints)) return fail("constraints");
      for (const constraint of job.constraints) {
        if (!object(constraint) || Object.keys(constraint).sort().join() !== "kind,quote"
          || !["effective_count_one", "no_additional_copy"].includes(String(constraint.kind))) return fail("constraint_authority");
        const quote = span(source.text, constraint.quote);
        if (quote.start < body.end && body.start < quote.end) return fail("constraint_overlap");
      }
    }
  } else if (value.purpose === "concern") {
    if (subjectIds.length !== 1 || job.domain !== "care_concern" || job.operation !== "transition"
      || job.targetRef !== null || job.petName !== p.petNames[0] || !["resolved", "reopened"].includes(String(job.toState))) return fail("unbound_target");
    span(source.text, job.authorizationQuote);
  } else if (value.purpose === "receipt") {
    if (job.operation !== "read" || job.domain !== "operation_receipt" || job.reference !== null
      || job.scope !== (value.scope === "owner_receipt" ? "owner" : "subjects")) return fail("receipt_purpose");
  } else {
    span(source.text, job.authorizationQuote);
    if (object(job.pendingDisposition)) bindCancellationSelector(job.pendingDisposition, context, subjectIds);
  }
  const intent = freeze(structuredClone(value)) as CatalogIntent;
  const permit: CatalogPermit = freeze({ id: randomUUID(), ownerId: context.owner.userId, requestId, sourceTurnId: source.id,
    sourceHash: catalogDigest(source), intentHash: catalogDigest(intent), subjectIds, purpose: intent.purpose,
    scope: intent.scope, conversationId: context.conversationId,
    pendingScope: intent.purpose === "lifecycle" && object((intent.request.lifecyclePlan as JsonObject).pendingDisposition) ? "current_conversation" : null, cutoff: source.createdAt, expiresAt, maxRows: ["replace", "remove"].includes(intent.purpose) ? 40 : 12, maxBytes: 120_000 });
  issued.set(permit, { operationId: admission.operationId, identity: catalogDigest(permit), intent, context, phase: "bound" });
  return { intent, permit };
}
export function assertCatalogPermit(permit: CatalogPermit, purpose: CatalogPurpose, phase: PermitState["phase"]) {
  const state = issued.get(permit);
  if (!state || getActiveAiAdmission()?.operationId !== state.operationId || state.phase !== phase || permit.purpose !== purpose || state.identity !== catalogDigest(permit)
    || Date.now() >= permit.expiresAt || state.intent.request === null
    || permit.conversationId !== state.context.conversationId || permit.sourceHash !== catalogDigest(sourceIdentity(state.context)) || permit.ownerId !== state.context.owner.userId
    || permit.intentHash !== catalogDigest(state.intent)) return fail("permit_identity_phase_or_expiry");
  return state;
}
export function beginCatalogHydration(permit: CatalogPermit) {
  assertCatalogPermit(permit, permit.purpose, "bound").phase = "hydrating";
}
export function sealCatalog(permit: CatalogPermit, catalog: unknown) {
  const state = assertCatalogPermit(permit, permit.purpose, "hydrating");
  if (Buffer.byteLength(JSON.stringify(catalog), "utf8") > permit.maxBytes) return fail("catalog_byte_limit");
  state.catalogHash = catalogDigest(catalog); state.phase = "hydrated";
  return freeze(catalog);
}
const continuationTokens = new WeakMap<object, CatalogPermit>();
export type CatalogContinuationToken = Readonly<{ permitId: string }>;
export function consumeCatalogContinuationToken(token: CatalogContinuationToken | undefined) {
  const permit = token && continuationTokens.get(token);
  if (!permit) return fail("continuation_authority");
  assertCatalogPermit(permit, permit.purpose, "continuing");
  continuationTokens.delete(token!);
}
export function beginCatalogContinuation(permit: CatalogPermit, catalog: unknown) {
  const state = assertCatalogPermit(permit, permit.purpose, "hydrated");
  if (permit.purpose === "lifecycle" || state.catalogHash !== catalogDigest(catalog)) return fail("continuation_catalog");
  state.phase = "continuing";
  const token = Object.freeze({ permitId: permit.id });
  continuationTokens.set(token, permit);
  return token;
}
export function bindCatalogSelection(permit: CatalogPermit, catalog: unknown, selection: unknown, refs: readonly string[]) {
  const state = assertCatalogPermit(permit, permit.purpose, "continuing");
  if (state.catalogHash !== catalogDigest(catalog) || !object(selection)
    || Object.keys(selection).sort().join() !== "disposition,reference,version" || selection.version !== "ask-catalog-selection.v1"
    || !["selected", "clarify", "unavailable"].includes(String(selection.disposition))) return fail("continuation_snapshot");
  if (selection.disposition !== "selected") {
    if (selection.reference !== null) return fail("continuation_limitation");
    state.phase = "bound_target"; return null;
  }
  if (typeof selection.reference !== "string" || refs.filter(ref => ref === selection.reference).length !== 1) return fail("exact_handle");
  const request = structuredClone(state.intent.request);
  const key = { replace: "writeJob", remove: "removeJob", concern: "stateTransitionJob", receipt: "storedRead", lifecycle: "lifecyclePlan" }[permit.purpose];
  const job = request[key] as JsonObject;
  if (permit.purpose === "replace" || permit.purpose === "remove") job.target = { kind: "exact_record", ref: selection.reference };
  else if (permit.purpose === "concern") job.targetRef = selection.reference;
  else job.reference = selection.reference;
  state.phase = "bound_target";
  return request;
}
export function finishDeterministicCatalog(permit: CatalogPermit, catalog: unknown) {
  const state = assertCatalogPermit(permit, "lifecycle", "hydrated");
  if (state.catalogHash !== catalogDigest(catalog)) return fail("catalog_snapshot");
  state.phase = "bound_target"; return structuredClone(state.intent.request);
}
