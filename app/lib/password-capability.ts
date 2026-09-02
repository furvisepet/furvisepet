import type { User } from "@supabase/supabase-js";
import { getConnectedAuthProviders } from "./auth-identity.ts";

export type PasswordCapabilityRecoveryOutcome =
  | "authorization_consumed"
  | "authorization_expired"
  | "authorization_invalid"
  | "completed"
  | "in_progress"
  | "provider_failure"
  | "reconciliation_required";

export type PasswordCapabilityReconciliation =
  | "not_required"
  | "recorded"
  | "reconciliation_required";

export function hasPasswordAuthCapability(
  user: Pick<User, "app_metadata"> | null | undefined,
  passwordAuthEnabledAt: string | null | undefined,
) {
  return getConnectedAuthProviders(user).includes("email")
    || typeof passwordAuthEnabledAt === "string" && passwordAuthEnabledAt.length > 0;
}

export async function reconcilePasswordAuthCapabilityAfterRecovery(input: {
  attempts?: number;
  outcome: PasswordCapabilityRecoveryOutcome;
  recordCapability: (enabledAt: string) => Promise<boolean>;
  wait?: (delayMs: number) => Promise<void>;
}): Promise<PasswordCapabilityReconciliation> {
  if (input.outcome !== "completed" && input.outcome !== "reconciliation_required") {
    return "not_required";
  }

  const attempts = Math.max(1, Math.min(3, Math.floor(input.attempts ?? 3)));
  const enabledAt = new Date().toISOString();
  const wait = input.wait ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await input.recordCapability(enabledAt)) return "recorded";
    } catch { /* Provider success remains authoritative while Furvise state retries. */ }
    if (attempt + 1 < attempts) await wait(25 * 2 ** attempt);
  }
  return "reconciliation_required";
}
