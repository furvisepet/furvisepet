import "server-only";

import type { AuthFlow } from "./types";
import { emitOperationalEvent } from "../../operations/events";

export function logAuthAbuseEvent(input: {
  captchaPresent: boolean;
  elapsedMs: number;
  emailDecision?: "allowed" | "denied" | "not_applicable";
  flow: AuthFlow;
  ipDecision?: "allowed" | "denied" | "unavailable";
  outcome: string;
  requestId: string;
}) {
  if (input.outcome === "rate_limited" || input.outcome.includes("captcha")) emitOperationalEvent({
    errorCode: input.outcome === "rate_limited" ? "AUTH_RATE_LIMITED" : "CAPTCHA_FAILED",
    eventType: input.outcome === "rate_limited" ? "auth_throttled" : "auth_captcha_failure",
    metadata: { captchaPresent: input.captchaPresent, flow: input.flow, outcome: input.outcome }, requestId: input.requestId,
    route: `/api/auth/${input.flow}`, severity: "warning",
  });
  console.info("[Furvise auth] flow decision", {
    captchaPresent: input.captchaPresent,
    elapsedMs: input.elapsedMs,
    emailDecision: input.emailDecision || "not_applicable",
    flow: input.flow,
    ipDecision: input.ipDecision || "allowed",
    outcome: input.outcome.slice(0, 80),
    requestId: input.requestId,
  });
}
