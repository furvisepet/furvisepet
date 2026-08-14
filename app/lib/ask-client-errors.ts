export type AskFailureCode =
  | "AUTH_REQUIRED"
  | "PET_NOT_FOUND"
  | "INVALID_MESSAGE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_DAILY_CAP_REACHED"
  | "AI_CREDITS_EXHAUSTED"
  | "AI_TEMPORARILY_UNAVAILABLE"
  | "AI_FEATURE_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "AI_OPERATION_CONFLICT"
  | "AI_REQUEST_ALREADY_ACTIVE"
  | "REQUEST_IN_PROGRESS"
  | "REQUEST_TIMEOUT"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_UNAVAILABLE"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "DATABASE_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export type AskErrorPresentation = {
  title: string;
  message: string;
  retryable: boolean;
  recommendedAction: "retry" | "edit" | "wait" | "sign_in" | "saved_data";
  retryAfterSeconds?: number;
};

export function getAskErrorPresentation(code: AskFailureCode | string, retryAfterSeconds?: number): AskErrorPresentation {
  const retryAfter = normalizeRetryAfter(retryAfterSeconds);
  if (code === "AI_DAILY_CAP_REACHED") return state(
    "You've reached today's AI limit",
    "Your pet profiles, history, and saved information are still available. You can use Ask again after the daily limit resets.",
    false,
    "saved_data",
  );
  if (code === "AI_CREDITS_EXHAUSTED") return state(
    "You've reached your Ask plan limit",
    "Your pet profiles, history, and saved information are still available. You can use Ask again when your plan allowance resets.",
    false,
    "saved_data",
  );
  if (["AI_TEMPORARILY_UNAVAILABLE", "AI_UNAVAILABLE", "AI_FEATURE_UNAVAILABLE", "AI_RATE_LIMITED", "RATE_LIMIT_UNAVAILABLE"].includes(code)) {
    return state("Furvise is temporarily unavailable", "Your question has been saved. Try again in a moment.", true, "retry", retryAfter);
  }
  if (code === "REQUEST_IN_PROGRESS" || code === "AI_REQUEST_ALREADY_ACTIVE") return state(
    "Furvise is still working on this question",
    retryAfter ? `Please wait about ${formatSeconds(retryAfter)} before checking again.` : "Please wait while the current answer finishes.",
    false,
    "wait",
    retryAfter,
  );
  if (code === "RATE_LIMITED") return state(
    "You're sending questions a little too quickly",
    retryAfter ? `Try again in about ${formatSeconds(retryAfter)}.` : "Wait a moment, then try again.",
    true,
    "retry",
    retryAfter,
  );
  if (code === "AUTH_REQUIRED") return state("Sign in to continue", "Your session expired. Sign in again to continue with Ask.", false, "sign_in");
  if (code === "PET_NOT_FOUND") return state("Choose another pet", "That pet is no longer available. Choose another pet before asking again.", false, "edit");
  if (["INVALID_MESSAGE", "AI_OPERATION_CONFLICT", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_INVALID"].includes(code)) {
    return state("Edit this question", "This question could not be submitted as written. Edit it and try again.", false, "edit");
  }
  if (code === "NETWORK_ERROR" || code === "REQUEST_TIMEOUT") return state(
    "Furvise couldn't finish that answer",
    "The connection ended before the answer arrived. Your question is still here, so you can try again safely.",
    true,
    "retry",
  );
  if (code === "IDEMPOTENCY_UNAVAILABLE") return state("Furvise is temporarily unavailable", "Your question is still here. Try again in a moment.", true, "retry", retryAfter);
  if (code === "DATABASE_ERROR") return state("Furvise is temporarily unavailable", "Your question has been saved. Try again in a moment.", true, "retry");
  return state("Furvise couldn't answer just now", "Please try again, or edit your question before resubmitting it.", true, "retry");
}

function state(
  title: string,
  message: string,
  retryable: boolean,
  recommendedAction: AskErrorPresentation["recommendedAction"],
  retryAfterSeconds?: number,
): AskErrorPresentation {
  return { title, message, retryable, recommendedAction, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

function normalizeRetryAfter(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.min(3600, Math.ceil(Number(value))) : undefined;
}

function formatSeconds(seconds: number) { return `${seconds} second${seconds === 1 ? "" : "s"}`; }
