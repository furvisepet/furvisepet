import type { AskV2Phase3Mode } from "./rollout.ts";

export function phase3AllowsShadowRead(mode: AskV2Phase3Mode) {
  return mode === "shadow_read" || mode === "low_risk_dual_write";
}

export function phase3AllowsLowRiskWrite(mode: AskV2Phase3Mode) {
  return mode === "low_risk_dual_write";
}

export async function executePhase3WriteFailOpen<T>(operation: () => Promise<T>) {
  try {
    return { status: "ok" as const, value: await operation() };
  } catch (error) {
    return { status: "failed" as const, error };
  }
}
