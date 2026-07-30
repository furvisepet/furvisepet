export type CspMode = "enforce" | "off" | "report-only";

export function getCspMode(env: Record<string, string | undefined> = process.env): CspMode {
  const configured = env.FURVISE_CSP_MODE?.trim().toLowerCase();
  if (configured === "enforce" || configured === "off" || configured === "report-only") return configured;
  return "report-only";
}

export function buildContentSecurityPolicy(input: {
  env?: Record<string, string | undefined>;
  nonce?: string | null;
  production?: boolean;
} = {}) {
  const env = input.env || process.env;
  const production = input.production ?? env.NODE_ENV === "production";
  const nonce = input.nonce?.trim() || "";
  const supabaseOrigin = exactOrigin(env.NEXT_PUBLIC_SUPABASE_URL, ["https:"]);
  const imageOrigins = configuredOrigins(env.FURVISE_ALLOWED_IMAGE_ORIGINS, ["https:"]);
  const connectOrigins = configuredOrigins(env.FURVISE_ALLOWED_CONNECT_ORIGINS, ["https:", "wss:"]);
  const reportUri = sameOriginReportPath(env.FURVISE_CSP_REPORT_URI);

  const scriptSources = nonce
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(!production ? ["'unsafe-eval'"] : [])]
    : ["'self'", "'unsafe-inline'", ...(!production ? ["'unsafe-eval'"] : [])];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["script-src", scriptSources],
    ["script-src-attr", ["'none'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", unique(["'self'", "data:", ...imageOrigins])],
    ["font-src", ["'self'"]],
    ["connect-src", unique([
      "'self'",
      ...(supabaseOrigin ? [supabaseOrigin] : []),
      ...connectOrigins,
      ...(!production ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
    ])],
    ["frame-src", ["'none'"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
  ];
  if (production) directives.push(["upgrade-insecure-requests", []]);
  if (reportUri) directives.push(["report-uri", [reportUri]]);
  return directives.map(([name, values]) => `${name}${values.length ? ` ${values.join(" ")}` : ""}`).join("; ");
}

export function getCspHeaderName(mode: CspMode) {
  if (mode === "enforce") return "Content-Security-Policy";
  if (mode === "report-only") return "Content-Security-Policy-Report-Only";
  return null;
}

export function configuredOrigins(value: string | undefined, protocols: string[]) {
  if (!value?.trim()) return [];
  return unique(value.split(",").map((item) => exactOrigin(item, protocols)).filter((item): item is string => Boolean(item))).sort();
}

function exactOrigin(value: string | undefined, protocols: string[]) {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

function sameOriginReportPath(value: string | undefined) {
  const candidate = value?.trim() || "";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return null;
  try {
    const parsed = new URL(candidate, "https://furvise.local");
    return parsed.origin === "https://furvise.local" ? `${parsed.pathname}${parsed.search}` : null;
  } catch { return null; }
}

function unique(values: string[]) { return [...new Set(values)]; }
