import "server-only";

import type { AuthFlow } from "./types";

export function logAuthAbuseEvent(input: {
  captchaPresent: boolean;
  elapsedMs: number;
  emailDecision?: "allowed" | "denied" | "not_applicable";
  flow: AuthFlow;
  ipDecision?: "allowed" | "denied" | "unavailable";
  outcome: string;
  requestId: string;
}) {
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
