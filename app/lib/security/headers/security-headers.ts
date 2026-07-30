import { buildContentSecurityPolicy, getCspHeaderName, getCspMode } from "./content-security-policy.ts";

export const PERMISSIONS_POLICY = [
  "accelerometer=()", "bluetooth=()", "browsing-topics=()", "camera=()", "display-capture=()",
  "fullscreen=()", "geolocation=()", "gyroscope=()", "interest-cohort=()", "magnetometer=()",
  "microphone=()", "payment=()", "usb=()",
].join(", ");

export function buildSecurityHeaders(input: {
  env?: Record<string, string | undefined>;
  https?: boolean;
  nonce?: string | null;
  production?: boolean;
} = {}) {
  const env = input.env || process.env;
  const production = input.production ?? env.NODE_ENV === "production";
  const headers: Array<{ key: string; value: string }> = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  const mode = getCspMode(env);
  const cspHeader = getCspHeaderName(mode);
  if (cspHeader) headers.push({ key: cspHeader, value: buildContentSecurityPolicy({ env, nonce: input.nonce, production }) });
  if (production && input.https !== false) headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  return headers;
}

export function applySecurityHeaders(headers: Headers, input: Parameters<typeof buildSecurityHeaders>[0] = {}) {
  for (const header of buildSecurityHeaders(input)) headers.set(header.key, header.value);
}

export function getSecurityHeadersForNextConfig(env: Record<string, string | undefined> = process.env) {
  return buildSecurityHeaders({ env, https: true, production: env.NODE_ENV === "production" });
}
