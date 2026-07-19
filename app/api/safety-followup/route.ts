import { NextResponse } from "next/server";
import {
  PetWiseAnalysis,
  SafetyFollowupAnswer,
  parseAnalysis,
  parseSafetyFollowupResult,
  validateDogProfileInput,
} from "../../lib/ai-analysis";
import { createAiAnalysisProvider } from "../../lib/ai/provider";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Expected a request object." }, { status: 400 });
  }

  const input = payload as {
    profile?: unknown;
    analysis?: unknown;
    followUpQuestions?: unknown;
    followUpAnswers?: unknown;
    questions?: unknown;
    answers?: unknown;
  };
  const validation = validateDogProfileInput(input.profile);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const originalAnalysis = parseAnalysis(input.analysis);
  if (!originalAnalysis) {
    return NextResponse.json({ error: "Expected original AI analysis." }, { status: 400 });
  }

  if (!isEligibleSoonSafetyAnalysis(originalAnalysis)) {
    return NextResponse.json(
      { error: "Safety follow-up is only available for non-emergency paused cases." },
      { status: 400 },
    );
  }

  const questions = parseQuestions(input.followUpQuestions ?? input.questions);
  const answers = parseAnswers(input.followUpAnswers ?? input.answers);
  if (questions.length === 0 || answers.length === 0) {
    return NextResponse.json(
      { error: "Expected follow-up questions and answers." },
      { status: 400 },
    );
  }

  if (
    answers.length !== questions.length ||
    questions.some((question) => !answers.some((answer) => answer.question === question))
  ) {
    return NextResponse.json(
      { error: "Every follow-up question requires an answer." },
      { status: 400 },
    );
  }

  try {
    const provider = createAiAnalysisProvider();
    const result = await provider.analyzeSafetyFollowup({
      profile: validation.profile,
      originalAnalysis,
      questions,
      answers,
    });
    const validatedResult = parseSafetyFollowupResult(result);
    if (!validatedResult) {
      console.warn("Furvise safety follow-up failed validation", {
        dogNamePresent: Boolean(validation.profile.name.trim()),
      });
      return NextResponse.json(
        { error: "AI safety follow-up unavailable.", fallback: true },
        { status: 502 },
      );
    }

    console.info("Furvise safety follow-up completed", {
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
      decision: validatedResult.decision,
      urgency: validatedResult.urgency,
    });
    return NextResponse.json(validatedResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI provider error.";
    console.warn("Furvise safety follow-up unavailable", {
      reason: message,
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
    });
    return NextResponse.json(
      { error: "AI safety follow-up unavailable.", fallback: true },
      { status: 503 },
    );
  }
}

function isEligibleSoonSafetyAnalysis(analysis: PetWiseAnalysis) {
  return analysis.vetAttention.needed === true && analysis.vetAttention.urgency === "soon";
}

function parseQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueNonEmptyStrings(value.filter((item): item is string => typeof item === "string")).slice(
    0,
    3,
  );
}

function parseAnswers(value: unknown): SafetyFollowupAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const draft = item as Partial<SafetyFollowupAnswer>;
      if (typeof draft.question !== "string" || typeof draft.answer !== "string") return null;
      const question = draft.question.trim().replace(/\s+/g, " ");
      const answer = draft.answer.trim().replace(/\s+/g, " ");
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is SafetyFollowupAnswer => item !== null)
    .slice(0, 3);
}

function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
