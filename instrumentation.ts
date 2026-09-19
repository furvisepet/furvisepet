import type { Instrumentation } from "next";
import { requestErrorEvent } from "./app/lib/operations/request-error-event";

export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  const event = requestErrorEvent(context.routePath, crypto.randomUUID(), new Date().toISOString());
  console.error("[Furvise operations]", event);
  try {
    const { writeDashboardEvent } = await import("./app/lib/operations/dashboard-telemetry");
    await writeDashboardEvent(event);
  } catch {
    // Monitoring must never cause another failed request or expose database errors.
    console.warn("[Owner monitoring] telemetry write unavailable");
  }
};
