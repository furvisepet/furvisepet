import { timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { createOperationsAdminClient } from "../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../lib/operations/events";
import { validateProductionConfiguration } from "../../lib/operations/production-config";

export const dynamic = "force-dynamic";
const EXPECTED_MIGRATION = "20260730032000";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  if (!authorized(request.headers.get("x-furvise-operator-key"), process.env.FURVISE_READINESS_SECRET)) {
    return Response.json({ code: "NOT_FOUND", error: "Not found." }, { headers: { "Cache-Control": "no-store" }, status: 404 });
  }
  const config = validateProductionConfiguration();
  const components: Record<string, "ready" | "unavailable" | "misconfigured"> = { application: "ready", configuration: config.ready ? "ready" : "misconfigured", database: "unavailable", migrations: "unavailable", redis: "unavailable" };
  try {
    const admin = createOperationsAdminClient();
    const { data, error } = await admin.rpc("furvise_readiness_snapshot").abortSignal(AbortSignal.timeout(1_000));
    if (!error && Array.isArray(data) && data[0]) {
      components.database = "ready";
      components.migrations = data[0].latest_migration === EXPECTED_MIGRATION ? "ready" : "misconfigured";
      if (components.migrations !== "ready") emitOperationalEvent({ errorCode: "MIGRATION_MISMATCH", eventType: "migration_mismatch", requestId, route: "/api/readiness", severity: "critical" });
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
