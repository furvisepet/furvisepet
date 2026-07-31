import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  PetWiseAnalysis,
  SafetyFollowupAnswer,
  parseAnalysis,
} from "../../lib/ai-analysis";
import { AiCreditLimitReachedError, runWithAiCredit } from "../../lib/ai/usage-ledger";
import { getAskModelConfiguration } from "../../lib/ai/ask-reasoning";
import { runAdmittedAiOperation } from "../../lib/ai/usage-guard/admission";
import { AiAdmissionError, aiAdmissionErrorResponse } from "../../lib/ai/usage-guard/errors";
import { getUserPlan, type PlanId } from "../../lib/billing/plan-limits";
import {
  adaptSafetyFollowupToLegacy,
  applySafetyFloor,
  buildFurviseContext,
  logIntelligenceEvent,
  parseIntelligenceSafetyFollowup,
  persistFeatureIntelligenceLearnings,
  runFeatureIntelligence,
  type FeatureIntelligenceResult,
  type IntelligenceSafetyFollowup,
} from "../../lib/intelligence";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../lib/security/request";
import { RateLimitRejection, requireRateLimitedRequest } from "../../lib/security/rate-limit";
import { validateSensitiveRequestOriginResponse } from "../../lib/security/headers/origin-policy";
import { claimIdempotentOperation } from "../../lib/security/idempotency";

export async function POST(request: Request) {
  const auth = await loadSafetyRequestContext(request);
  if ("response" in auth) return auth.response;
  let payload: unknown;
  try { payload = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return NextResponse.json({ error: oversized ? "The safety follow-up is too large." : "Expected a valid request object." }, { status: oversized ? 413 : 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Expected a request object." }, { status: 400 });
  if (!hasOnlyKeys(payload, ["petId", "profileId", "profile", "analysis", "followUpQuestions", "followUpAnswers", "questions", "answers", "requestId"])) return NextResponse.json({ error: "The safety follow-up contains unsupported fields." }, { status: 400 });

  const input = payload as {
    petId?: unknown; profileId?: unknown; profile?: unknown; analysis?: unknown;
    followUpQuestions?: unknown; followUpAnswers?: unknown; questions?: unknown; answers?: unknown; requestId?: unknown;
  };
  const petId = firstString(input.petId, input.profileId, readObjectString(input.profile, "id"));
  if (!petId) return NextResponse.json({ error: "Choose the pet for this safety follow-up." }, { status: 400 });
  const originalAnalysis = parseAnalysis(input.analysis);
  if (!originalAnalysis) return NextResponse.json({ error: "The original Furvise guidance is missing." }, { status: 400 });
  if (!isEligibleSoonSafetyAnalysis(originalAnalysis)) {
    return NextResponse.json({ error: "Safety follow-up is only available for non-emergency paused cases." }, { status: 400 });
  }
  const questions = parseQuestions(input.followUpQuestions ?? input.questions);
  const answers = parseAnswers(input.followUpAnswers ?? input.answers);
  if (!hasCompleteAnswers(questions, answers)) {
    return NextResponse.json({ error: "Every follow-up question requires an answer." }, { status: 400 });
  }

  const requestId = validUuid(input.requestId) ? input.requestId : randomUUID();
  // Safety state follows the owner's newest evidence. The questions are supplied
  // separately so warning words in a prompt cannot keep a resolved concern urgent.
  const currentMessage = answers.map((answer) => answer.answer).join("\n");
  let context: Awaited<ReturnType<typeof buildFurviseContext>>;
  try {
    context = await buildFurviseContext({
      currentMessage, feature: "safety_followup", locale: request.headers.get("accept-language")?.split(",")[0] || "en",
      petId, supabase: auth.supabase, userId: auth.userId,
    });
  } catch {
    logIntelligenceEvent("safety follow-up context failed", { feature: "safety_followup", petId, requestId, safeCode: "PET_OR_CONTEXT_UNAVAILABLE" });
    return NextResponse.json({ error: "That pet or its current care context is no longer available." }, { status: 404 });
  }

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  const idempotency = await claimIdempotentOperation({ candidateKey: requestId, leaseSeconds: 180, operationType: "safety.followup", payload: { answers, petId, questions }, request, retention: "financial", supabase: auth.supabase, userId: auth.userId });
  if ("response" in idempotency) return idempotency.response;
  return idempotency.operation.execute(async () => { try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { answers, petId, questions },
      policy: "SAFETY_FOLLOWUP_AI",
      request,
      requestId,
      route: "/api/safety-followup",
      userId: auth.userId,
    });
    let persistenceWarning = "";
    const generated = await runAdmittedAiOperation({
      feature: "safety_followup", intendedModel: getAskModelConfiguration().primary,
      payload: { answers, petId, questions }, requestId, userId: auth.userId,
    }, () => runWithAiCredit<FeatureIntelligenceResult<IntelligenceSafetyFollowup>>({
      feature: "safety_followup", planId: auth.planId, requestId, supabase: auth.supabase, userId: auth.userId,
      generate: async () => runFeatureIntelligence({
        context, feature: "safety_followup", maxOutputTokens: 650,
        featureInput: {
          followUpQuestions: questions,
          followUpAnswers: answers,
          previousSafetyAnalysis: {
            summary: originalAnalysis.summary,
            urgency: originalAnalysis.vetAttention.urgency,
            reason: originalAnalysis.vetAttention.reason,
          },
        },
        parseValue: parseIntelligenceSafetyFollowup,
      }),
      beforeComplete: async (result) => {
        if (!result.acceptedLearnings.length && !result.acceptedCareActions.length) return;
        try {
          await persistFeatureIntelligenceLearnings({
            careActions: result.acceptedCareActions, feature: "safety_followup", learnings: result.acceptedLearnings,
            petId, requestId, supabase: auth.supabase,
          });
        } catch {
          persistenceWarning = "The guidance is available, but the follow-up could not be added to saved care context.";
          logIntelligenceEvent("safety follow-up learning persistence failed", { feature: "safety_followup", petId, requestId, safeCode: "NONFATAL_PERSISTENCE" });
        }
      },
    }));
    const structured = generated.value.value;
    const safetyLevel = applySafetyFloor(structured.safetyLevel, generated.value.safety);
    const normalized = { ...structured, safetyLevel, shoppingSuppressed: safetyLevel === "urgent" || safetyLevel === "emergency" ? true : structured.shoppingSuppressed };
    const legacy = adaptSafetyFollowupToLegacy(normalized);
    logIntelligenceEvent("safety follow-up completed", {
      acceptedCareActionCount: generated.value.acceptedCareActions.length,
      acceptedLearningCount: generated.value.acceptedLearnings.length,
      feature: "safety_followup", petId, requestId, safetyLevel,
    });
    return NextResponse.json({ ...legacy, intelligence: normalized, ...(persistenceWarning ? { persistenceWarning } : {}), usage: generated.usage });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    if (error instanceof AiAdmissionError) return aiAdmissionErrorResponse(error, requestId);
    if (error instanceof AiCreditLimitReachedError) return NextResponse.json({ error: "You have used this month's AI credits.", limitReached: true }, { status: 402 });
    logIntelligenceEvent("safety follow-up failed", { feature: "safety_followup", petId, requestId, safeCode: "GENERATION_UNAVAILABLE" });
    return NextResponse.json({ error: "Safety guidance is temporarily unavailable.", fallback: true }, { status: 503 });
  } finally {
    if (rateGate) await rateGate.release();
  } });
}

async function loadSafetyRequestContext(request: Request): Promise<
  | { response: Response }
  | { planId: PlanId; supabase: SupabaseClient; userId: string }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!url || !key) return { response: NextResponse.json({ error: "Safety guidance is temporarily unavailable." }, { status: 503 }) };
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: NextResponse.json({ error: "Your session has expired." }, { status: 401 }) };
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };
  return { planId: await getUserPlan(data.user.id), supabase, userId: data.user.id };
}

function isEligibleSoonSafetyAnalysis(analysis: PetWiseAnalysis) {
  return analysis.vetAttention.needed === true && analysis.vetAttention.urgency === "soon";
}

function parseQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueNonEmptyStrings(value.filter((item): item is string => typeof item === "string")).slice(0, 3);
}

function parseAnswers(value: unknown): SafetyFollowupAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const draft = item as Partial<SafetyFollowupAnswer>;
    const question = typeof draft.question === "string" ? draft.question.trim().replace(/\s+/g, " ") : "";
    const answer = typeof draft.answer === "string" ? draft.answer.trim().replace(/\s+/g, " ") : "";
    return question && answer ? { question, answer } : null;
  }).filter((item): item is SafetyFollowupAnswer => item !== null).slice(0, 3);
}

function hasCompleteAnswers(questions: string[], answers: SafetyFollowupAnswer[]) {
  return questions.length > 0 && answers.length === questions.length && questions.every((question) => answers.some((answer) => answer.question === question));
}

function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => value.trim().replace(/\s+/g, " ")).filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function firstString(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() || ""; }
function readObjectString(value: unknown, key: string) { return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : null; }
