import { bindCancellationSelector, retainCancellationAuthority } from "../furvise-brain/lifecycle-plan.ts";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext } from "./types.ts";
import type { ConcernReference } from "../furvise-brain/state-transition-job.ts";
import { getFurviseActionPolicy } from "../application-actions/policy.ts";
import { parseStoredFurviseActionKind } from "../application-actions/types.ts";
import { parseStoredApplicationActions } from "../application-actions/contracts.ts";
import { loadReplaceReferences } from "./replace-reference-context.ts";
import { loadStoredReadReferences } from "../furvise-brain/stored-read-organ.ts";
import { assertCatalogPermit, beginCatalogHydration, sealCatalog, catalogDigest, type CatalogPermit } from "./catalog-intent.ts";

/** USER source is rechecked without fetching response/action/receipt columns. */
export async function verifyPlanningCatalogSource(permit: CatalogPermit, db: SupabaseClient) {
  const { data, error } = await db.from("ask_conversation_messages").select("id,user_id,conversation_id,role,user_text,created_at")
    .eq("id", permit.sourceTurnId).eq("user_id", permit.ownerId).eq("conversation_id", permit.conversationId).eq("role", "user").maybeSingle();
  if (error || !data || data.user_id !== permit.ownerId || data.conversation_id !== permit.conversationId || data.role !== "user"
    || catalogDigest({ id: data.id, text: data.user_text, createdAt: data.created_at }) !== permit.sourceHash)
    throw Error("ASK_CATALOG_USER_SOURCE_CHANGED");
}

/** One permitted purpose per request. The catalog is evidence, never USER authorization. */
export async function hydratePlanningCatalog(permit: CatalogPermit, context: FurviseLiveContext, db: SupabaseClient) {
  assertCatalogPermit(permit, permit.purpose, "bound");
  if (context.owner.userId !== permit.ownerId || context.currentTurn?.id !== permit.sourceTurnId) throw Error("ASK_CATALOG_CONTEXT_CHANGED");
  await verifyPlanningCatalogSource(permit, db);
  beginCatalogHydration(permit);
  let hydrated = { ...context };
  let evidence: unknown;
  let refs: string[] = [];
  if (permit.purpose === "replace" || permit.purpose === "remove") {
    const references = await loadReplaceReferences(permit);
    hydrated = { ...hydrated, replaceReferences: references };
    refs = references.map(r => r.ref);
    evidence = references.map(r => ({ reference: r.ref, body: r.body, eventAt: r.eventAt }));
  } else if (permit.purpose === "receipt") {
    const references = await loadStoredReadReferences(permit, db);
    hydrated = { ...hydrated, storedReadReferences: references };
    refs = references.map(r => r.ref);
    evidence = references.map(r => ({ reference: r.ref, action: r.actionKind, requestedAt: r.createdAt, sourceTurnId: r.sourceMessageId }));
  } else if (permit.purpose === "concern") {
    const result = await db.from("pet_concerns").select("id,user_id,pet_profile_id,title,status,updated_at")
      .eq("user_id", permit.ownerId).in("pet_profile_id", [...permit.subjectIds]).lte("updated_at", permit.cutoff)
      .in("status", ["active", "monitoring", "reopened", "resolved"]).order("updated_at", { ascending: false }).limit(permit.maxRows);
    if (result.error || !Array.isArray(result.data)) throw Error("ASK_CATALOG_UNAVAILABLE");
    const references: ConcernReference[] = result.data.map(row => {
      if (row.user_id !== permit.ownerId || !permit.subjectIds.includes(row.pet_profile_id)
        || !Number.isFinite(Date.parse(row.updated_at)) || Date.parse(row.updated_at) > Date.parse(permit.cutoff)) throw Error("ASK_CATALOG_SCOPE_CHANGED");
      return { ref: randomUUID(), ownerId: permit.ownerId, petId: row.pet_profile_id, concernId: row.id,
        title: row.title, status: row.status };
    });
    hydrated = { ...hydrated, concernReferences: references };
    refs = references.map(r => r.ref);
    evidence = references.map(r => ({ reference: r.ref, title: r.title, currentState: r.status }));
  } else {
    // Saved lifecycle and pending capabilities are read only after scope is bound.
    const states = await db.from("dog_profiles").select("id,user_id,lifecycle_status")
      .eq("user_id", permit.ownerId).in("id", [...permit.subjectIds]);
    if (states.error || !Array.isArray(states.data) || states.data.length !== permit.subjectIds.length
      || states.data.some(row => row.user_id !== permit.ownerId || !permit.subjectIds.includes(row.id)
        || !["active", "archived", "deceased"].includes(row.lifecycle_status))) throw Error("ASK_CATALOG_STATE_UNKNOWN");
    // Cancellation requires the complete current-conversation pending set across subjects.
    // Subject-state enrichment alone does not read unrelated capabilities or claim completeness.
    let pending: ReturnType<typeof parseStoredApplicationActions> = [];
    let assistantMessageIds: string[] = [];
    if (permit.pendingScope === "current_conversation") {
      const messages = await db.from("ask_conversation_messages").select("id,user_id,conversation_id,role,created_at")
        .eq("user_id", permit.ownerId).eq("conversation_id", permit.conversationId).eq("role", "furvise")
        .lte("created_at", permit.cutoff).order("created_at", { ascending: false }).limit(permit.maxRows + 1);
      if (messages.error || !Array.isArray(messages.data) || messages.data.length > permit.maxRows
        || messages.data.some(row => row.user_id !== permit.ownerId || row.conversation_id !== permit.conversationId
          || row.role !== "furvise" || typeof row.id !== "string" || !Number.isFinite(Date.parse(row.created_at))
          || Date.parse(row.created_at) > Date.parse(permit.cutoff))) throw Error("ASK_CATALOG_PENDING_MEMBERSHIP_UNKNOWN");
      assistantMessageIds = messages.data.map(row => row.id);
      if (new Set(assistantMessageIds).size !== assistantMessageIds.length) throw Error("ASK_CATALOG_PENDING_MEMBERSHIP_UNKNOWN");
      const actions = assistantMessageIds.length ? await db.from("ask_action_capabilities")
        .select("id,user_id,pet_profile_id,assistant_message_id,source_message_id,action_kind,action_payload,receipt,status,expires_at,created_at")
        .eq("user_id", permit.ownerId).in("assistant_message_id", assistantMessageIds).lte("created_at", permit.cutoff)
        .in("status", ["pending"]).in("action_kind", ["pet.mark_deceased", "pet.archive", "pet.mark_active"])
        .order("created_at", { ascending: false }).limit(permit.maxRows + 1) : { data: [], error: null };
      const owned = new Set(context.eligiblePets.filter(p => p.user_id === permit.ownerId).map(p => p.id));
      if (actions.error || !Array.isArray(actions.data) || actions.data.length > permit.maxRows
        || actions.data.some(row => row.user_id !== permit.ownerId || !owned.has(row.pet_profile_id)
          || !assistantMessageIds.includes(row.assistant_message_id) || row.status !== "pending"
          || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > Date.parse(permit.cutoff))) throw Error("ASK_CATALOG_PENDING_UNKNOWN");
      const sourceIds = [...new Set(actions.data.map(row => row.source_message_id))];
      const sources = sourceIds.length ? await db.from("ask_conversation_messages").select("id,user_id,conversation_id,role,created_at")
        .eq("user_id", permit.ownerId).eq("conversation_id", permit.conversationId).eq("role", "user")
        .in("id", sourceIds).lte("created_at", permit.cutoff).limit(permit.maxRows + 1) : { data: [], error: null };
      if (sources.error || !Array.isArray(sources.data) || sources.data.length !== sourceIds.length
        || sources.data.some(row => row.user_id !== permit.ownerId || row.conversation_id !== permit.conversationId || row.role !== "user")
        || sourceIds.some(id => !sources.data.some(row => row.id === id))) throw Error("ASK_CATALOG_PENDING_SOURCE_UNKNOWN");
      pending = parseStoredApplicationActions(actions.data.map(row => {
        const kind = parseStoredFurviseActionKind(row.action_kind);
        if (!kind || !row.action_payload || row.action_payload.kind !== kind || row.action_payload.petId !== row.pet_profile_id
          || row.action_payload.sourceMessageId !== row.source_message_id || !Number.isFinite(Date.parse(row.expires_at))) throw Error("ASK_CATALOG_PENDING_MALFORMED");
        const policy = getFurviseActionPolicy(kind);
        const expired = Date.parse(row.expires_at) <= Date.now();
        return { ...row.action_payload, ...policy, id: row.id, kind, petId: row.pet_profile_id,
          sourceMessageId: row.source_message_id, status: expired ? "failed" : "confirmation_required",
          resultMessage: null, errorMessage: expired ? "That action expired before it was confirmed." : null };
      }));
      if (pending.length !== actions.data.length || new Set(pending.map(action => action.id)).size !== pending.length) throw Error("ASK_CATALOG_PENDING_MALFORMED");
    }
    const eligiblePets = context.eligiblePets.map(pet => {
      const state = states.data.find(row => row.id === pet.id);
      return state ? { ...pet, lifecycle_status: state.lifecycle_status } : pet;
    });
    hydrated = { ...hydrated, eligiblePets, pet: eligiblePets.find(pet => pet.id === context.pet.id)!,
      lifecycleActionState: { ownerId: permit.ownerId, complete: permit.pendingScope === "current_conversation", actions: pending,
        provenance: permit.pendingScope === "current_conversation" ? { scope: "current_conversation", conversationId: permit.conversationId,
          sourceTurnId: permit.sourceTurnId, cutoff: permit.cutoff, assistantMessageIds, capabilityIds: pending.map(a => a.id) } : undefined } };
    evidence = { states: states.data, pending };
  }
  await verifyPlanningCatalogSource(permit, db);
  const originating = assertCatalogPermit(permit, permit.purpose, "hydrating");
  if (permit.pendingScope === "current_conversation") {
    const job = originating.intent.request.lifecyclePlan as Record<string, unknown>;
    retainCancellationAuthority(hydrated, bindCancellationSelector(job.pendingDisposition, originating.context, permit.subjectIds), permit.expiresAt);
  }
  const catalog = sealCatalog(permit, { permitId: permit.id, purpose: permit.purpose, evidence,
    snapshot: { replacements: hydrated.replaceReferences, concerns: hydrated.concernReferences,
      receipts: hydrated.storedReadReferences, lifecycle: hydrated.lifecycleActionState } });
  return { context: hydrated, catalog, refs };
}
