import { PRIVATE_CACHE_HEADERS } from "../../security/private-routes.ts";

export type AiAdmissionErrorCode = "AI_DAILY_CAP_REACHED" | "AI_FEATURE_UNAVAILABLE" | "AI_OPERATION_CONFLICT" | "AI_PROVIDER_BUDGET_EXHAUSTED" | "AI_TEMPORARILY_UNAVAILABLE";

export class AiAdmissionError extends Error {
  readonly code: AiAdmissionErrorCode;
  readonly status: number;
  constructor(code: AiAdmissionErrorCode, message: string, status = 503) {
    super(message); this.name = "AiAdmissionError"; this.code = code; this.status = status;
  }
}

export function aiAdmissionErrorResponse(error: AiAdmissionError, requestId: string) {
  const publicCode = error.code === "AI_PROVIDER_BUDGET_EXHAUSTED" ? "AI_TEMPORARILY_UNAVAILABLE" : error.code;
  const messages: Record<string, string> = {
    AI_DAILY_CAP_REACHED: "AI guidance is temporarily unavailable. Please try again later.",
    AI_FEATURE_UNAVAILABLE: "This AI guidance feature is temporarily unavailable. Your saved information is still available.",
    AI_OPERATION_CONFLICT: "That request identifier was already used for different information.",
    AI_TEMPORARILY_UNAVAILABLE: "AI guidance is temporarily unavailable. Your saved pet information and care history are still available.",
  };
  return Response.json({ code: publicCode, error: messages[publicCode], requestId }, { headers: PRIVATE_CACHE_HEADERS, status: error.status });
}
