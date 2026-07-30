import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  parseAnalysis,
  parseAnalysisMemoryContext,
  validateDogProfileInput,
} from "../../lib/ai-analysis";
import { createAiAnalysisProvider } from "../../lib/ai/provider";
import { AiCreditLimitReachedError, runWithAiCredit } from "../../lib/ai/usage-ledger";
import { getUserPlan } from "../../lib/billing/plan-limits";
import { API_BODY_LIMITS, RequestBoundaryError, readBoundedJson } from "../../lib/security/request";
import { safeErrorForLog } from "../../lib/security/logging";
import { RateLimitRejection, requireRateLimitedRequest } from "../../lib/security/rate-limit";

export async function POST(request: Request) {
  const context = await loadAiRequestContext(request);
  if ("response" in context) return context.response;
  let payload: unknown;

  try {
    payload = await readBoundedJson(request, API_BODY_LIMITS.standard);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return NextResponse.json({ error: oversized ? "Request body is too large." : "Invalid JSON request body." }, { status: oversized ? 413 : 400 });
  }

  const profileInput =
    payload && typeof payload === "object" && "profile" in payload
      ? (payload as { profile: unknown }).profile
      : payload;
  const validation = validateDogProfileInput(profileInput);
  if (!validation.ok) {
    console.warn("Analyze validation failed", { missingFields: validation.missingFields });
    return NextResponse.json(
      {
        error: "incomplete_profile",
        message: validation.message,
        missingFields: validation.missingFields,
      },
      { status: 400 },
    );
  }
  const memories =
    payload && typeof payload === "object" && "memories" in payload
      ? parseAnalysisMemoryContext((payload as { memories: unknown }).memories)
      : [];
  const rawRequestId = payload && typeof payload === "object" && "requestId" in payload ? (payload as { requestId?: unknown }).requestId : null;
  const requestId = typeof rawRequestId === "string" && /^[0-9a-f-]{36}$/i.test(rawRequestId) ? rawRequestId : randomUUID();

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { memories, profile: validation.profile },
      policy: "PRODUCT_GUIDANCE_AI",
      request,
      requestId,
      route: "/api/analyze",
      userId: context.userId,
    });
    const generated = await runWithAiCredit({ feature: "care_plan", planId: context.planId, requestId, supabase: context.supabase, userId: context.userId, generate: async () => {
      const provider = createAiAnalysisProvider();
      const analysis = await provider.analyzeDogProfile({ profile: validation.profile, memories });
      const validatedAnalysis = parseAnalysis(analysis);
      if (!validatedAnalysis) throw new Error("AI_SCHEMA_INVALID");
      return validatedAnalysis;
    } });
    const validatedAnalysis = generated.value;

    console.info("Furvise analysis completed", {
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
      confidence: validatedAnalysis.confidence,
      vetAttention: validatedAnalysis.vetAttention.urgency,
    });
    return NextResponse.json({ analysis: validatedAnalysis, usage: generated.usage });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    if (error instanceof AiCreditLimitReachedError) return NextResponse.json({ error: "You have used this month's AI credits.", limitReached: true }, { status: 402 });
    console.warn("Furvise analysis unavailable", {
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
      ...safeErrorForLog(error),
    });
    return NextResponse.json(
      { error: "Furvise guidance is temporarily unavailable.", fallback: true },
      { status: 503 },
    );
  } finally {
    if (rateGate) await rateGate.release();
  }
}

async function loadAiRequestContext(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  if (!url || !key) return { response: NextResponse.json({ error: "Furvise guidance is temporarily unavailable." }, { status: 503 }) } as const;
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: NextResponse.json({ error: "Your session has expired." }, { status: 401 }) } as const;
  return { planId: await getUserPlan(data.user.id), supabase, userId: data.user.id };
}
