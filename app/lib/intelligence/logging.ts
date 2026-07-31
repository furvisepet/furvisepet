import { redactLogContext, safeErrorForLog } from "../security/logging";

export function logIntelligenceEvent(event: string, context: Record<string, unknown>) {
  console.info(`[Furvise intelligence] ${event}`, redactLogContext(context));
}

export function logIntelligenceError(stage: string, error: unknown, context: Record<string, unknown> = {}) {
  console.warn("[Furvise intelligence] stage failed", redactLogContext({
    ...context,
    ...safeErrorForLog(error),
    stage,
  }));
}
