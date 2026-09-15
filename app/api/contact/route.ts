import { validateSensitiveRequestOriginResponse } from "../../lib/security/headers/origin-policy";
import { randomUUID } from "node:crypto";
import { readBoundedJson, RequestBoundaryError } from "../../lib/security/request";
import { beginRateLimitedRequest } from "../../lib/security/rate-limit";
import { parseContactReport, sendContactReport } from "../../lib/contact/report";

import { MAX_REPORT_BODY_BYTES } from "../../lib/contact/constants";

export const runtime = "nodejs";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return originResponse;
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Open the contact page to send your report." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Invalid report format." }, 415);
  const limit = await beginRateLimitedRequest({ request, requestId: randomUUID(), policy: "CONTACT_REPORT", route: "/api/contact", userId: "contact-global", enabled: true });
  if (!limit.allowed) return limit.response;
  let report;
  try {
    report = parseContactReport(await readBoundedJson(request, MAX_REPORT_BODY_BYTES));
  } catch (error) {
    if (error instanceof RequestBoundaryError) return json({ error: error.code === "PAYLOAD_TOO_LARGE" ? "Choose a screenshot under 2 MB." : "Invalid report format." }, error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400);
    return json({ error: error instanceof Error ? error.message : "Check your report and try again." }, 400);
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FURVISE_SUPPORT_FROM;
  if (!key || !from) return json({ error: "Report sending is temporarily unavailable. Your report is still here. You can email furvisepet@gmail.com instead." }, 503);
  try {
    const reference = await sendContactReport(report, { key, from });
    return json({ reference });
  } catch {
    return json({ error: "We couldn't confirm your report was sent. Your text and screenshot are still here. Please try again, or email furvisepet@gmail.com." }, 502);
  }
}
