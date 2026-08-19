import { buildFurviseQuotaMessage, buildFurviseUnavailableMessage } from "./furvise-voice.ts";

export type AskFailureCode =
  | "INVALID_CURRENT_INPUT"
  | "AUTH_REQUIRED"
  | "PET_UNAVAILABLE"
  | "CLARIFICATION_REQUIRED"
  | "PLAN_LIMIT"
  | "RATE_LIMIT"
  | "TEMPORARY_PROVIDER_FAILURE"
  | "TEMPORARY_DATABASE_FAILURE"
  | "ACTION_FAILED"
  | "ANSWER_RETRYABLE"
  | "REQUEST_IN_PROGRESS";

export type AskInternalFailure =
  | "invalid_input"
  | "auth_required"
  | "pet_unavailable"
  | "clarification_required"
  | "plan_limit"
  | "rate_limit"
  | "provider_failure"
  | "database_failure"
  | "action_failure"
  | "request_in_progress"
  | "answer_retryable";

export type AskErrorPresentation = {
  title: string;
  message: string;
  retryable: boolean;
  recommendedAction: "retry" | "edit" | "wait" | "sign_in" | "saved_data" | "clarify";
  retryAfterSeconds?: number;
};

const publicCodeByFailure: Readonly<Record<AskInternalFailure, AskFailureCode>> = {
  invalid_input: "INVALID_CURRENT_INPUT",
  auth_required: "AUTH_REQUIRED",
  pet_unavailable: "PET_UNAVAILABLE",
  clarification_required: "CLARIFICATION_REQUIRED",
  plan_limit: "PLAN_LIMIT",
  rate_limit: "RATE_LIMIT",
  provider_failure: "TEMPORARY_PROVIDER_FAILURE",
  database_failure: "TEMPORARY_DATABASE_FAILURE",
  action_failure: "ACTION_FAILED",
  request_in_progress: "REQUEST_IN_PROGRESS",
  answer_retryable: "ANSWER_RETRYABLE",
};

export function publicAskFailureCode(failure: AskInternalFailure) {
  return publicCodeByFailure[failure];
}

export function getAskErrorPresentation(code: AskFailureCode, retryAfterSeconds?: number): AskErrorPresentation {
  const retryAfter = normalizeRetryAfter(retryAfterSeconds);
  switch (code) {
    case "AUTH_REQUIRED": return state("Sign in to continue", "Your session expired. Sign in again to continue with Ask.", false, "sign_in");
    case "INVALID_CURRENT_INPUT": return state("Check this message", "This message could not be sent as written. Review it and try again.", false, "edit");
    case "PET_UNAVAILABLE": return state("Choose another pet", "That pet or conversation is no longer available.", false, "saved_data");
    case "CLARIFICATION_REQUIRED": return state("One detail is missing", "Choose the intended pet so Furvise can continue safely.", false, "clarify");
    case "PLAN_LIMIT": return state("You've reached your Ask plan limit", buildFurviseQuotaMessage(), false, "saved_data");
    case "RATE_LIMIT": return state("You're sending questions a little too quickly", retryAfter ? `Try again in about ${formatSeconds(retryAfter)}.` : "Wait a moment, then try again.", true, "retry", retryAfter);
    case "REQUEST_IN_PROGRESS": return state("Furvise is still working on this question", retryAfter ? `Please wait about ${formatSeconds(retryAfter)} before checking again.` : "Please wait while the current answer finishes.", false, "wait", retryAfter);
    case "ACTION_FAILED": return state("That action didn't finish", "Your answer is still available. Review the action and try it again when you're ready.", true, "retry");
    case "TEMPORARY_DATABASE_FAILURE": return state("Furvise couldn't save this answer", "Your question is still here. Try again in a moment.", true, "retry");
    case "TEMPORARY_PROVIDER_FAILURE": return state("Furvise couldn't finish that answer", buildFurviseUnavailableMessage(), true, "retry", retryAfter);
    case "ANSWER_RETRYABLE": return state("Furvise couldn't finish that answer", buildFurviseUnavailableMessage(), true, "retry", retryAfter);
  }
}

function state(title: string, message: string, retryable: boolean, recommendedAction: AskErrorPresentation["recommendedAction"], retryAfterSeconds?: number): AskErrorPresentation {
  return { title, message, retryable, recommendedAction, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

function normalizeRetryAfter(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.min(3600, Math.ceil(Number(value))) : undefined;
}

function formatSeconds(seconds: number) { return `${seconds} second${seconds === 1 ? "" : "s"}`; }
