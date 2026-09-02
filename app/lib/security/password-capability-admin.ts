import "server-only";
import { createOperationsAdminClient } from "../operations/admin-client";

export async function recordPasswordAuthCapability(userId: string, enabledAt: string) {
  const admin = createOperationsAdminClient();
  const { error } = await admin.from("user_profiles").upsert({
    password_auth_enabled_at: enabledAt,
    user_id: userId,
  }, { onConflict: "user_id" });
  return !error;
}
