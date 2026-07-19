import { NextResponse } from "next/server";
import {
  parseAnalysis,
  parseAnalysisMemoryContext,
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

  try {
    const provider = createAiAnalysisProvider();
    const analysis = await provider.analyzeDogProfile({ profile: validation.profile, memories });
    const validatedAnalysis = parseAnalysis(analysis);
    if (!validatedAnalysis) {
      console.warn("Furvise analysis failed validation", {
        dogNamePresent: Boolean(validation.profile.name.trim()),
      });
      return NextResponse.json(
        { error: "AI analysis unavailable.", fallback: true },
        { status: 502 },
      );
    }

    console.info("Furvise analysis completed", {
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
      confidence: validatedAnalysis.confidence,
      vetAttention: validatedAnalysis.vetAttention.urgency,
    });
    return NextResponse.json({ analysis: validatedAnalysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI provider error.";
    console.warn("Furvise analysis unavailable", {
      reason: message,
      provider: process.env.PETWISE_AI_PROVIDER || "openai",
    });
    return NextResponse.json(
      { error: "AI analysis unavailable.", fallback: true },
      { status: 503 },
    );
  }
}
