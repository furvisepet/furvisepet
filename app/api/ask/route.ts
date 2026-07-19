import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  answerPetMemoryQuestion,
  buildPetMemoryContext,
  classifyAskMemoryIntent,
  detectSafetyFlags,
  getLastWeekDateRange,
  shouldUseGroundedAskFallback,
  type PetMemoryContext,
} from "../../lib/pet-memory";
import { askResponseJsonSchema, buildAskSaveMetadata, parseAskResponse } from "../../lib/ask.mjs";
import { generateGroundedAskAnswer, isGroundedAskFallbackConfigured } from "../../lib/ai/ask-furvise";
import type {
  CareEntryRow,
  DogMemoryRow,
  DogProductFeedbackRow,
  DogProfileRow,
} from "../../lib/supabase";
import { FURVISE_SAFETY_LINE, FURVISE_URGENT_SAFETY_MESSAGE } from "../../lib/safety-copy";
import {
  AskUsageReadError,
  getAskUsageStatus,
  incrementAskUsage,
  logAskUsageError,
  type AskUsageStatus,
  type SupabaseLike,
} from "../../lib/billing/ask-usage";
import {
  getPaidGateMessage,
  getPlanCapabilities,
  isEarlyAccessFreeUnlockEnabled,
  getUserPlan,
  type PlanId,
} from "../../lib/billing/plan-limits";

const friendlyAnswerFailure = "Furvise could not answer right now. Please try again.";
const repairInstruction = "Deterministic memory answers do not require AI repair.";
const askCareEntryRecallLimit = 200;

export async function GET(request: Request) {
  const context = await loadAskRequestContext(request);
  if ("response" in context) return context.response;
  return Response.json({ usage: context.usage });
}

export async function POST(request: Request) {
  void askResponseJsonSchema;
  void repairInstruction;
  const context = await loadAskRequestContext(request);
  if ("response" in context) return context.response;
  const { planId, supabase, usage, userId } = context;

  const body = await request.json().catch(() => null) as {
    petId?: unknown;
    previousResponse?: unknown;
    question?: unknown;
  } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const previousResponse = body?.previousResponse ? parseAskResponse(body.previousResponse) : null;
  if (!question || question.length > 1200 || (!petId && petId !== "all")) {
    return Response.json({ error: "Choose pet context and enter a shorter question." }, { status: 400 });
  }
  if (body?.previousResponse && !previousResponse) {
    return Response.json({ error: "The follow-up context is no longer available. Ask a new question." }, { status: 400 });
  }

  const plannedGate = buildPlannedCapabilityResponse(question, planId);
  const askIntent = classifyAskMemoryIntent(question);
  if (plannedGate) {
    return Response.json({
      contextUsed: null,
      intent: "general_pet_question",
      response: plannedGate,
      saveMetadata: buildAskSaveMetadata(plannedGate, {
        cannotAnswerFromSavedData: true,
        intent: "general_pet_question",
        question,
        usedSavedFactsCount: 0,
      }),
      urgent: false,
      usage,
    });
  }

  if (!usage.allowed) {
    return Response.json(
      {
        error: "You've used your free Ask Furvise messages for this month. Your care log, dashboard, pet profiles, and curated product suggestions are still available.",
        usage,
      },
      { status: 402 },
    );
  }

  const profileQuery = supabase.from("dog_profiles").select("*").eq("user_id", userId);
  const { data: profiles, error: profileError } =
    petId === "all"
      ? await profileQuery.returns<DogProfileRow[]>()
      : await profileQuery.eq("id", petId).returns<DogProfileRow[]>();
  if (profileError) return Response.json({ error: "Furvise could not load pet context." }, { status: 500 });
  if (!profiles?.length) return Response.json({ error: "No matching pet profile was found." }, { status: 404 });

  const profileIds = profiles.map((profile) => profile.id);
  const recentEntriesQuery = supabase
    .from("pet_care_entries")
    .select("*")
    .in("pet_profile_id", profileIds)
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(askCareEntryRecallLimit)
    .returns<CareEntryRow[]>();
  const dateRangeEntriesQuery =
    askIntent === "last_week_logs"
      ? loadLastWeekCareEntries({ profileIds, supabase, userId })
      : Promise.resolve({ data: [], error: null });

  const [recentEntriesResult, dateRangeEntriesResult, memoriesResult, feedbackResult] = await Promise.all([
    recentEntriesQuery,
    dateRangeEntriesQuery,
    supabase
      .from("dog_memories")
      .select("*")
      .in("dog_profile_id", profileIds)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80)
      .returns<DogMemoryRow[]>(),
    supabase
      .from("dog_product_feedback")
      .select("*")
      .in("dog_profile_id", profileIds)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80)
      .returns<DogProductFeedbackRow[]>(),
  ]);

  if (recentEntriesResult.error || dateRangeEntriesResult.error || memoriesResult.error || feedbackResult.error) {
    return Response.json({ error: "Furvise could not load saved pet memory." }, { status: 500 });
  }

  const entries = mergeCareEntries(recentEntriesResult.data || [], dateRangeEntriesResult.data || []);
  const memories = memoriesResult.data || [];
  const feedback = feedbackResult.data || [];
  const memoryContexts = profiles.map((profile) =>
    buildPetMemoryContext({
      careEntries: entries.filter((entry) => entry.pet_profile_id === profile.id),
      productFeedback: feedback.filter((item) => item.dog_profile_id === profile.id),
      profile,
      savedMemories: memories.filter((memory) => memory.dog_profile_id === profile.id),
    }),
  );

  const contextUsed = {
    petName: memoryContexts.length === 1 ? memoryContexts[0].pet.name : null,
    profileCount: memoryContexts.length,
    productFeedbackCount: feedback.length,
    recentUpdateCount: entries.length,
    savedDetailCount: memories.length,
    storedGuidanceCount: entries.filter((entry) => isFurviseGeneratedCareEntry(entry)).length,
  };

  let response;
  try {
    response =
      memoryContexts.length === 1
        ? await answerSinglePetMemoryQuestion(memoryContexts[0], question)
        : answerAllPetsMemoryQuestion(memoryContexts, question);
  } catch {
    return Response.json({ error: friendlyAnswerFailure }, { status: 503 });
  }

  let nextUsage = usage;
  try {
    const updatedUsage = await incrementAskUsage({
      monthKey: usage.monthKey,
      previousCount: usage.count,
      supabase: supabase as unknown as SupabaseLike,
      userId,
    });
    nextUsage = formatUsageStatus({
      ...usage,
      count: updatedUsage.count,
    });
  } catch (error) {
    logAskUsageError("incrementAskUsage", error);
  }

  return Response.json({
    contextUsed,
    intent: response.intent,
    response: response.response,
    saveMetadata: buildAskSaveMetadata(response.response, {
      intent: response.intent,
      question,
    }),
    urgent: response.urgent,
    usage: nextUsage,
  });
}

async function answerSinglePetMemoryQuestion(memory: PetMemoryContext, question: string) {
  const deterministicAnswer = answerPetMemoryQuestion(memory, question);
  if (!shouldUseGroundedAskFallback(memory, question) || !isGroundedAskFallbackConfigured()) {
    return deterministicAnswer;
  }

  try {
    const groundedAnswer = await generateGroundedAskAnswer({ memory, question });
    if (!groundedAnswer) return deterministicAnswer;
    return {
      intent: deterministicAnswer.intent,
      response: groundedAnswer,
      urgent: false,
    };
  } catch (error) {
    logGroundedAskFallbackError(error);
    return deterministicAnswer;
  }
}

function logGroundedAskFallbackError(error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise ask] grounded fallback failed", {
    message: error instanceof Error ? error.message : "Unknown grounded Ask fallback error",
  });
}

async function loadAskRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      supabase: SupabaseClient;
      usage: AskUsageStatus;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };

  const planId = await getUserPlan(userData.user.id);
  const plan = getPlanCapabilities(planId);
  const earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled();
  let usage: AskUsageStatus;
  try {
    usage = await getAskUsageStatus({
      earlyAccessUnlocked,
      monthlyLimit: plan.askFurviseMonthlyLimit,
      planId,
      supabase: supabase as unknown as SupabaseLike,
      userId: userData.user.id,
    });
  } catch (error) {
    if (error instanceof AskUsageReadError) {
      return {
        response: Response.json(
          {
            error: "Furvise could not load Ask usage. Ask usage setup may be incomplete.",
          },
          { status: 503 },
        ),
      };
    }
    throw error;
  }
  return { planId, supabase, usage, userId: userData.user.id };
}

function formatUsageStatus(usage: AskUsageStatus): AskUsageStatus {
  const remaining = Math.max(0, usage.limit - usage.count);
  return {
    ...usage,
    allowed: usage.earlyAccessUnlocked || usage.count < usage.limit,
    gate: {
      ...usage.gate,
      allowed: usage.earlyAccessUnlocked || usage.count < usage.limit,
      hardBlocked: !usage.earlyAccessUnlocked && usage.count >= usage.limit,
      remaining,
    },
    remaining,
  };
}

function loadLastWeekCareEntries({
  profileIds,
  supabase,
  userId,
}: {
  profileIds: string[];
  supabase: SupabaseClient;
  userId: string;
}) {
  const { end, start } = getLastWeekDateRange();
  return supabase
    .from("pet_care_entries")
    .select("*")
    .in("pet_profile_id", profileIds)
    .eq("user_id", userId)
    .gte("occurred_at", start.toISOString())
    .lte("occurred_at", end.toISOString())
    .order("occurred_at", { ascending: false })
    .returns<CareEntryRow[]>();
}

function mergeCareEntries(...groups: CareEntryRow[][]) {
  const byId = new Map<string, CareEntryRow>();
  groups.flat().forEach((entry) => byId.set(entry.id, entry));
  return [...byId.values()].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
}

function isFurviseGeneratedCareEntry(entry: CareEntryRow) {
  return /^furvise\b/i.test(entry.title || "") || /^furvise-generated (guidance|note)/i.test(entry.note || "");
}

function buildPlannedCapabilityResponse(question: string, planId: PlanId) {
  const normalized = question.toLowerCase();
  const plan = getPlanCapabilities(planId);
  if (/\b(export|pdf|download|printable report|vet[- ]?prep report)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      plan.vetPrepExports
        ? "Exportable vet-prep reports are not built yet."
        : getPaidGateMessage("vetPrepExports"),
    );
  }
  if (/\b(long|older|all history|pattern|trend|over time|months?)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      plan.longHistoryPatternDetection
        ? "Longer-history pattern detection is not built yet."
        : getPaidGateMessage("longHistoryPatternDetection"),
    );
  }
  if (/\b(live product|research products|current price|chewy|amazon|walmart|retailer)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      plan.liveProductResearch
        ? "Live product research is not built yet."
        : getPaidGateMessage("liveProductResearch"),
    );
  }
  return null;
}

function plannedCapabilityResponse(message: string) {
  return {
    title: "Planned Furvise Plus capability",
    summary: message,
    sections: [
      {
        heading: "Still available",
        items: [
          "Care log, Dashboard, pet profiles, Results, safety guidance, and curated static product suggestions remain available.",
        ],
      },
    ],
    safetyNote: FURVISE_SAFETY_LINE,
  };
}

function answerAllPetsMemoryQuestion(memoryContexts: PetMemoryContext[], question: string) {
  const intent = classifyAskMemoryIntent(question);
  const safetyFlags = memoryContexts.flatMap((memory) => detectSafetyFlags(memory, question));
  const uniqueSafetyFlags = [...new Set(safetyFlags)];
  if (uniqueSafetyFlags.length > 0) {
    return {
      intent,
      urgent: true,
      response: {
        title: "Contact a veterinarian now",
        summary:
          "The saved context or question includes urgent warning signs. Contact an emergency veterinarian now.",
        sections: [{ heading: "Urgent signs detected", items: uniqueSafetyFlags }],
        safetyNote:
          `${FURVISE_SAFETY_LINE} ${FURVISE_URGENT_SAFETY_MESSAGE}`,
      },
    };
  }

  if (intent === "last_week_logs") {
    const perPet = memoryContexts.map((memory) => answerPetMemoryQuestion(memory, question).response);
    return {
      intent,
      urgent: false,
      response: {
        title: "Last week's saved logs",
        summary: `I checked ${memoryContexts.length} saved pet profile${memoryContexts.length === 1 ? "" : "s"}.`,
        sections: perPet.map((response) => ({
          heading: response.title,
          items:
            response.sections.flatMap((section) => section.items).length > 0
              ? response.sections.flatMap((section) => section.items)
              : [response.summary],
        })),
        safetyNote: null,
      },
    };
  }

  return {
    intent,
    urgent: false,
    response: {
      title: "Saved pet memory summary",
      summary: `I checked ${memoryContexts.length} saved pet profile${memoryContexts.length === 1 ? "" : "s"}.`,
      sections: memoryContexts.map((memory) => ({
        heading: memory.pet.name,
        items:
          memory.timeline.recentEntries.length > 0
            ? memory.timeline.recentEntries
                .slice(0, 3)
                .map((entry) => `${new Date(entry.date).toLocaleDateString("en-US", { timeZone: "UTC" })} - ${entry.category} - ${entry.title}${entry.detail ? ` - ${entry.detail}` : ""}`)
            : [`Furvise has ${memory.pet.name}'s profile, but no recent care updates yet.`],
      })),
      safetyNote: null,
    },
  };
}
