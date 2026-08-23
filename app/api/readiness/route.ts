import { timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { createOperationsAdminClient } from "../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../lib/operations/events";
import { validateProductionConfiguration } from "../../lib/operations/production-config";
import { REQUIRED_SECURITY_MIGRATIONS, schemaReadinessFailures } from "../../lib/operations/readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  if (!authorized(request.headers.get("x-furvise-operator-key"), process.env.FURVISE_READINESS_SECRET)) {
    return Response.json({ code: "NOT_FOUND", error: "Not found." }, { headers: { "Cache-Control": "no-store" }, status: 404 });
  }
  const config = validateProductionConfiguration();
  const components: Record<string, "ready" | "unavailable" | "misconfigured"> = { application: "ready", configuration: config.ready ? "ready" : "misconfigured", database: "unavailable", migrations: "unavailable", redis: "unavailable" };
  try {
    const admin = createOperationsAdminClient();
    const signal = AbortSignal.timeout(1_000);
    const [{ data, error }, billingAccounts, deletionTombstones, securityCompatibility] = await Promise.all([
      admin.rpc("furvise_readiness_snapshot").abortSignal(signal),
      admin.from("billing_accounts").select("user_id,stripe_customer_id,stripe_subscription_id,plan,subscription_status").limit(1).abortSignal(signal),
      admin.from("billing_deletion_tombstones").select("user_id,stripe_customer_id,stripe_subscription_id,deletion_idempotency_key").limit(1).abortSignal(signal),
      admin.rpc("furvise_security_compatibility_snapshot", { p_required_migrations: [...REQUIRED_SECURITY_MIGRATIONS] }).abortSignal(signal),
    ]);
    if (!error && Array.isArray(data) && data[0]) {
      components.database = "ready";
      const failures = schemaReadinessFailures({
        billingAccountsError: billingAccounts.error,
        deletionTombstonesError: deletionTombstones.error,
        latestMigration: data[0].latest_migration,
        securityCompatibility: Array.isArray(securityCompatibility.data) ? securityCompatibility.data[0] : null,
        securityCompatibilityError: securityCompatibility.error,
      });
      components.migrations = failures.length === 0 ? "ready" : "misconfigured";
      for (const failure of failures) {
        emitOperationalEvent({ errorCode: `SCHEMA_COMPATIBILITY:${failure}`, eventType: "migration_mismatch", requestId, route: "/api/readiness", severity: "critical" });
      }
    }
  } catch { /* Safe state remains unavailable. */ }
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(800), token, url });
      components.redis = await redis.ping() === "PONG" ? "ready" : "unavailable";
    }
  } catch { /* Safe state remains unavailable. */ }
  const ready = Object.values(components).every((state) => state === "ready");
  return Response.json({ components, status: ready ? "ready" : "not_ready" }, { headers: { "Cache-Control": "private, no-store, max-age=0" }, status: ready ? 200 : 503 });
}

function authorized(candidate: string | null, expected?: string) {
  if (!candidate || !expected || expected.length < 32) return false;
  const left = Buffer.from(candidate); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
