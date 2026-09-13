import { readVetBrief, vetBriefReadUnavailable } from "../../../lib/vet-brief/read";
import { prepareVetBrief } from "../../../lib/vet-brief/prepare";
import { validBriefDay } from "../../../lib/vet-brief/appointment-plan";
import { randomUUID } from "node:crypto";
import { featureFailureDetails } from "../../../lib/intelligence/feature-failure.ts";
import { getAskModelConfiguration } from "../../../lib/ai/ask-reasoning";
import { AiCreditLimitReachedError, AiCreditReplayRequiredError, checkAiCreditRequestReplay, hashAiCreditPayload, runWithAiCredit } from "../../../lib/ai/usage-ledger";
import { runAdmittedAiOperation } from "../../../lib/ai/usage-guard/admission";
import { AiAdmissionError, aiAdmissionErrorResponse } from "../../../lib/ai/usage-guard/errors";
import {
  buildFurviseContext,
  logIntelligenceEvent,
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

import { addVetBriefCoverage } from "../../../lib/vet-brief/review";

export const maxDuration = 300;

const MAX_VET_BRIEF_RANGE_DAYS = 36_600;
const MAX_REASON_FOR_VISIT_LENGTH = 12_000;

export async function GET(request: Request) {
  const auth = await getVetBriefRequestContext(request);
  if ("response" in auth) return auth.response;
  const petId = new URL(request.url).searchParams.get("pet") || "";
  if (!isSecurityUuid(petId)) return Response.json({ error: "Choose a pet." }, { status: 400 });
  const { data: pet, error } = await readVetBrief(() => auth.supabase.from("dog_profiles").select("id").eq("id", petId).eq("user_id", auth.userId).maybeSingle<{ id: string }>());
  if (error) return vetBriefReadUnavailable("draft_pet", error);
  if (!pet) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  return Response.json({ petId: pet.id }, { headers: { "Cache-Control": "private, no-store" } });
}

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
  if (reasonForVisit.length > MAX_REASON_FOR_VISIT_LENGTH) return Response.json({ error: "Keep the appointment note within 12,000 characters. Your text has not been submitted." }, { status: 400 });
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
  const retrospective = (context.pet.lifecycle_status || "active") !== "active";
  const existingDocument = parseVetBriefDocument(body?.existingDocument);

  const idempotency = await claimIdempotentOperation({
    candidateKey: requestId,
    leaseSeconds: 330,
    operationType: "vet_brief.generate",
    payload: { conversationId, existingDocument, from, petId, reasonForVisit, to },
    request,
    retention: "financial",
    supabase: auth.supabase,
    userId: auth.userId,
  });
  if ("response" in idempotency) return idempotency.response;

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  // A rejected admission performed no generation. Abandon its claim rather
  // than caching a temporary concurrency/rate denial as a completed result.
  try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { conversationId, existingDocument, from, petId, reasonForVisit, to },
      policy: "VET_BRIEF_AI",
      request,
      requestId,
      route: "/api/vet-briefs/draft",
      userId: auth.userId,
    });
  } catch (error) {
    await idempotency.operation.abandon("ADMISSION_NOT_STARTED");
    if (error instanceof RateLimitRejection) return error.response;
    throw error;
  }
  return idempotency.operation.execute(async () => { try {
    await checkAiCreditRequestReplay({
      feature: "vet_brief", logicalRequestId: requestId,
      payloadHash: hashAiCreditPayload("vet_brief", { conversationId, existingDocument, from, petId, reasonForVisit, to }),
      supabase: auth.supabase, userId: auth.userId,
    });
    const generated = await runAdmittedAiOperation({
      feature: "vet_brief", intendedModel: getAskModelConfiguration().primary,
      payload: { conversationId, existingDocument, from, petId, reasonForVisit, to }, requestId, userId: auth.userId,
    }, () => runWithAiCredit<IntelligenceVetBrief>({
      includeUsage: false,
      feature: "vet_brief", monthlyAiCredits: auth.monthlyAiCredits, payload: { conversationId, existingDocument, from, petId, reasonForVisit, to }, planId: auth.planId, requestId, supabase: auth.supabase, userId: auth.userId,
      generate: () => prepareVetBrief({ context, supabase: auth.supabase, baseline: { ...baseline.document, excludedSections: existingDocument?.excludedSections || [] }, retrospective, requestId }),
    }));
    const generatedDocument = addVetBriefCoverage(preserveOwnerEdits(generated.value.document, existingDocument), context.evidenceLoading?.sources || []);
    logIntelligenceEvent("vet brief generated", {
      feature: "vet_brief", petId, requestId, selectedCareEventCount: context.selectedCareEntries.length,
      selectedMemoryCount: context.memories.length + context.legacyPetMemories.length,
      sourceRecordCount: generated.value.sourceRecordIds.length,
    });
    return Response.json({
      document: generatedDocument,
      sourceEntryIds: generated.value.sourceRecordIds,
      usage: generated.usage,
    });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    if (error instanceof AiAdmissionError) return aiAdmissionErrorResponse(error, requestId);
    if (error instanceof AiCreditReplayRequiredError && error.status === "released") {
      return Response.json({ code: "AI_REQUEST_RELEASED", error: "The previous attempt ended without a charge. Prepare the brief with a new request." }, { status: 409 });
    }
    if (error instanceof AiCreditLimitReachedError) {
      return Response.json({ error: auth.planId === "free" ? "You've used your one free Vet Brief generation. Upgrade to Plus for four each month. You can still reopen and download your saved brief." : "You've used your Vet Brief generations for this period. You can still reopen and download saved briefs.", limitReached: true }, { status: 402 });
    }
    logIntelligenceEvent("vet brief generation failed", { feature: "vet_brief", petId, requestId, ...featureFailureDetails(error) });
    return Response.json({ code: "VET_BRIEF_PREPARATION_FAILED", error: "The Vet Visit Brief could not be prepared right now. Try again in a moment." }, { status: 503 });
  } finally {
    if (rateGate) await rateGate.release();
  } });
}

function preserveOwnerEdits(generated: VetBriefDocument, existing: VetBriefDocument | null) {
  if (!existing) return generated;
  return {
    ...generated,
    title: existing.title,
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

function isIsoDate(value: string) { return validBriefDay(value); }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
