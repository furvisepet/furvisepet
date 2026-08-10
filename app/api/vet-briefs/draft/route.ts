import { randomUUID } from "node:crypto";
import { getAskModelConfiguration } from "../../../lib/ai/ask-reasoning";
import { AiCreditLimitReachedError, runWithAiCredit } from "../../../lib/ai/usage-ledger";
import { runAdmittedAiOperation } from "../../../lib/ai/usage-guard/admission";
import { AiAdmissionError, aiAdmissionErrorResponse } from "../../../lib/ai/usage-guard/errors";
import {
  buildFurviseContext,
  logIntelligenceEvent,
  parseIntelligenceVetBrief,
  runFeatureIntelligence,
  type FeatureIntelligenceResult,
  type IntelligenceVetBrief,
} from "../../../lib/intelligence";
import type { DogMemoryRow } from "../../../lib/supabase";
import { buildVetBriefDraft } from "../../../lib/vet-brief/builder";
import { parseVetBriefDocument } from "../../../lib/vet-brief/schema";
import { getVetBriefRequestContext } from "../../../lib/vet-brief/server";
import type { VetBriefConversationMessage, VetBriefDocument } from "../../../lib/vet-brief/types";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, inclusiveDateSpanDays, isUuid as isSecurityUuid, readBoundedJson } from "../../../lib/security/request";
import { RateLimitRejection, requireRateLimitedRequest } from "../../../lib/security/rate-limit";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";

const MAX_VET_BRIEF_RANGE_DAYS = 730;
const MAX_REASON_FOR_VISIT_LENGTH = 1_200;

export async function POST(request: Request) {
  const auth = await getVetBriefRequestContext(request);
  if ("response" in auth) return auth.response;
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.vetBrief); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "The Vet Visit Brief request is too large." : "Send a valid Vet Visit Brief request." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["petId", "from", "to", "reasonForVisit", "conversationId", "requestId", "existingDocument"])) return Response.json({ error: "The Vet Visit Brief request contains unsupported fields." }, { status: 400 });
  const body = rawBody as {
    petId?: unknown; from?: unknown; to?: unknown; reasonForVisit?: unknown;
    conversationId?: unknown; requestId?: unknown; existingDocument?: unknown;
  } | null;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const from = typeof body?.from === "string" ? body.from : "";
  const to = typeof body?.to === "string" ? body.to : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
  const requestId = validUuid(body?.requestId) ? body.requestId : randomUUID();
  if (!isSecurityUuid(petId) || !isIsoDate(from) || !isIsoDate(to) || from > to || inclusiveDateSpanDays(from, to) > MAX_VET_BRIEF_RANGE_DAYS || (conversationId && !isSecurityUuid(conversationId))) {
    return Response.json({ error: "Choose a pet and valid date range." }, { status: 400 });
  }

  const reasonForVisit = typeof body?.reasonForVisit === "string" ? body.reasonForVisit.trim() : "";
  if (reasonForVisit.length > MAX_REASON_FOR_VISIT_LENGTH) return Response.json({ error: "Keep the visit note under 1,200 characters." }, { status: 400 });
  let context: Awaited<ReturnType<typeof buildFurviseContext>>;
  try {
    context = await buildFurviseContext({
      conversationId: conversationId || null,
      currentMessage: reasonForVisit || "Prepare a Vet Visit Brief from the selected date range.",
      dateRange: { from, to }, feature: "vet_brief", locale: request.headers.get("accept-language")?.split(",")[0] || "en",
      petId, supabase: auth.supabase, userId: auth.userId,
    });
  } catch {
    return Response.json({ error: conversationId ? "That pet or Ask Furvise conversation is not available." : "That pet profile is not available." }, { status: 404 });
  }

  const conversation = toVetBriefConversation(context.conversationTurns);
  const legacyMemories = [
    ...context.legacyPetMemories,
    ...context.memories.map((memory): DogMemoryRow => ({
      id: memory.id, user_id: memory.user_id, dog_profile_id: petId,
      type: memory.category, text: memoryText(memory.fact_value), confidence: String(memory.confidence),
      source: memory.source_type, created_at: memory.last_confirmed_at,
    })),
  ];
  const baseline = buildVetBriefDraft({
    profile: context.pet,
    careEntries: [...context.careEntries].sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at)),
    memories: legacyMemories, conversation,
    from, to, reasonForVisit,
  });
  const allowedSourceRecordIds = [...new Set([
    ...baseline.sourceEntryIds,
    ...context.activeConcerns.map((item) => item.id),
    ...context.recentlyResolvedConcerns.map((item) => item.id),
    ...context.memories.map((item) => item.id),
    ...context.legacyPetMemories.map((item) => item.id),
  ])];
  const existingDocument = parseVetBriefDocument(body?.existingDocument);

  const idempotency = await claimIdempotentOperation({
    candidateKey: requestId,
    leaseSeconds: 180,
    operationType: "vet_brief.generate",
    payload: { conversationId, existingDocument, from, petId, reasonForVisit, to },
    request,
    retention: "financial",
    supabase: auth.supabase,
    userId: auth.userId,
  });
  if ("response" in idempotency) return idempotency.response;

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  return idempotency.operation.execute(async () => { try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { conversationId, existingDocument, from, petId, reasonForVisit, to },
      policy: "VET_BRIEF_AI",
      request,
      requestId,
      route: "/api/vet-briefs/draft",
      userId: auth.userId,
    });
    const generated = await runAdmittedAiOperation({
      feature: "vet_brief", intendedModel: getAskModelConfiguration().primary,
      payload: { conversationId, existingDocument, from, petId, reasonForVisit, to }, requestId, userId: auth.userId,
    }, () => runWithAiCredit<FeatureIntelligenceResult<IntelligenceVetBrief>>({
      feature: "vet_brief", monthlyAiCredits: auth.monthlyAiCredits, planId: auth.planId, requestId, supabase: auth.supabase, userId: auth.userId,
      generate: async () => runFeatureIntelligence({
        context, feature: "vet_brief", maxOutputTokens: 1800,
        featureInput: {
          deterministicDraft: baseline.document,
          allowedSourceRecordIds,
          dateRange: { from, to },
          inclusionSettings: existingDocument ? {
            excludedSections: existingDocument.excludedSections,
            includePetPhoto: existingDocument.includePetPhoto,
          } : null,
        },
        parseValue: (value) => parseIntelligenceVetBrief(value, baseline.document, allowedSourceRecordIds),
      }),
    }));
    const generatedDocument = preserveOwnerEdits(generated.value.value.document, existingDocument);
    logIntelligenceEvent("vet brief generated", {
      feature: "vet_brief", petId, requestId, selectedCareEventCount: context.selectedCareEntries.length,
      selectedMemoryCount: context.memories.length + context.legacyPetMemories.length,
      sourceRecordCount: generated.value.value.sourceRecordIds.length,
    });
    return Response.json({
      document: generatedDocument,
      sourceEntryIds: generated.value.value.sourceRecordIds,
      usage: generated.usage,
    });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    if (error instanceof AiAdmissionError) return aiAdmissionErrorResponse(error, requestId);
    if (error instanceof AiCreditLimitReachedError) {
      return Response.json({ error: "You've used all of your AI guidance for this month.", limitReached: true }, { status: 402 });
    }
    logIntelligenceEvent("vet brief generation failed", { feature: "vet_brief", petId, requestId, safeCode: "GENERATION_UNAVAILABLE" });
    return Response.json({ error: "The Vet Visit Brief could not be prepared right now. Try again in a moment." }, { status: 503 });
  } finally {
    if (rateGate) await rateGate.release();
  } });
}

function preserveOwnerEdits(generated: VetBriefDocument, existing: VetBriefDocument | null) {
  if (!existing) return generated;
  return {
    ...generated,
    reasonForVisit: existing.reasonForVisit,
    ownerNotes: existing.ownerNotes,
    excludedSections: existing.excludedSections,
    includePetPhoto: existing.includePetPhoto,
  };
}

function toVetBriefConversation(turns: Array<{ role: "user" | "furvise"; text: string }>): VetBriefConversationMessage[] {
  return turns.map((turn) => turn.role === "user"
    ? { role: "user", text: turn.text }
    : { role: "furvise", response: { directAnswer: turn.text } });
}

function memoryText(value: unknown) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value ?? ""); }
}

function isIsoDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
