import type { OperationalEventType } from "../../operations/events/types.ts";

export function classifyAiGuardOperationalEvent(input: { denialReason?: string; emergencyDisabled?: boolean; safeErrorClass?: string }): OperationalEventType | null {
  if (input.denialReason === "daily_call_limit" || input.denialReason === "daily_cost_limit") return "ai_daily_cap_reached";
  if (input.emergencyDisabled || input.denialReason === "emergency_disabled") return "ai_emergency_disabled";
  if (input.safeErrorClass?.includes("RECONCILIATION") || input.denialReason === "provider_usage_reconciliation_failed") return "provider_usage_reconciliation_failure";
  if (input.denialReason === "provider_failed") return "provider_failure";
  if (input.denialReason === "operation_failed") return null;
  return input.denialReason || input.safeErrorClass ? "ai_admission_denied" : null;
}
