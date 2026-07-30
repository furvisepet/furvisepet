import { PRIVATE_CACHE_HEADERS } from "../private-routes.ts";
import { configuredOrigins } from "./content-security-policy.ts";

const CANONICAL_ORIGIN = "https://www.furvise.com";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type OriginValidationResult =
  | { allowed: true; mode: "browser-origin" | "non-browser-bearer" | "not-applicable" | "unauthenticated" }
  | { allowed: false; reason: "cross_site_fetch" | "foreign_origin" | "malformed_origin" | "missing_browser_origin" | "target_origin_mismatch" };

export function validateSensitiveRequestOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): OriginValidationResult {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return { allowed: true, mode: "not-applicable" };
  const originHeader = request.headers.get("origin")?.trim() || "";
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() || "";
  if (fetchSite === "cross-site") return { allowed: false, reason: "cross_site_fetch" };

  if (!originHeader) {
    if (fetchSite || hasAmbientAuthCookie(request)) return { allowed: false, reason: "missing_browser_origin" };
    if (/^Bearer\s+\S+/i.test(request.headers.get("authorization") || "")) return { allowed: true, mode: "non-browser-bearer" };
    return { allowed: true, mode: "unauthenticated" };
  }

  const origin = parseOrigin(originHeader);
  if (!origin) return { allowed: false, reason: "malformed_origin" };
  const allowedOrigins = getAllowedApplicationOrigins(request, env);
  if (!allowedOrigins.has(origin)) return { allowed: false, reason: "foreign_origin" };
  const targetOrigin = resolveTargetOrigin(request, env);
  if (!targetOrigin || targetOrigin !== origin) return { allowed: false, reason: "target_origin_mismatch" };
  return { allowed: true, mode: "browser-origin" };
}

export function originRejectionResponse(result: Extract<OriginValidationResult, { allowed: false }>, request?: Request) {
  console.warn("[Furvise origin policy] request denied", {
    method: request?.method || "UNKNOWN",
    reason: result.reason,
    route: request ? new URL(request.url).pathname : "unknown",
  });
  return Response.json(
    { code: "ORIGIN_NOT_ALLOWED", error: "This request could not be verified. Refresh Furvise and try again." },
    { headers: PRIVATE_CACHE_HEADERS, status: 403 },
  );
}

export function validateSensitiveRequestOriginResponse(request: Request, env: Record<string, string | undefined> = process.env) {
  const result = validateSensitiveRequestOrigin(request, env);
  return result.allowed ? null : originRejectionResponse(result, request);
}

export function getAllowedApplicationOrigins(request: Request, env: Record<string, string | undefined> = process.env) {
  const allowed = new Set([CANONICAL_ORIGIN, ...configuredOrigins(env.FURVISE_ALLOWED_ORIGINS, ["https:"])]);
  if (env.NODE_ENV !== "production") {
    const requestOrigin = parseOrigin(new URL(request.url).origin);
    if (requestOrigin && isDevelopmentLocalOrigin(requestOrigin)) allowed.add(requestOrigin);
    for (const origin of configuredOrigins(env.FURVISE_ALLOWED_DEVELOPMENT_ORIGINS, ["http:", "https:"])) {
      if (isDevelopmentLocalOrigin(origin)) allowed.add(origin);
    }
  }
  return allowed;
}

export function resolveTargetOrigin(request: Request, env: Record<string, string | undefined> = process.env) {
  const requestUrl = new URL(request.url);
  if (env.VERCEL === "1" && request.headers.get("x-vercel-id")) {
    const host = normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host") || "");
    const protocol = (request.headers.get("x-forwarded-proto") || "https").toLowerCase();
    if (!host || protocol !== "https") return null;
    return `https://${host}`;
  }
  const host = normalizeHost(request.headers.get("host") || requestUrl.host);
  if (!host || host !== requestUrl.host.toLowerCase()) return null;
  return `${requestUrl.protocol}//${host}`;
}

function parseOrigin(value: string) {
  if (!value || value === "null" || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

function normalizeHost(value: string) {
  const candidate = value.trim().toLowerCase();
  if (!candidate || candidate.includes(",") || candidate.includes("/") || candidate.includes("\\") || candidate.includes("@")) return null;
  try { return new URL(`https://${candidate}`).host === candidate ? candidate : null; } catch { return null; }
}

function hasAmbientAuthCookie(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  return /(?:^|;\s*)(?:sb-[^=;]+-auth-token(?:\.\d+)?|furvise-auth-session)=/i.test(cookie);
}

function isDevelopmentLocalOrigin(origin: string) {
  try { const host = new URL(origin).hostname; return host === "localhost" || host === "127.0.0.1"; } catch { return false; }
}
