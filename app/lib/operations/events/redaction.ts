import { createHmac } from "node:crypto";

const METADATA_KEYS = new Set(["allowed", "captchaPresent", "component", "count", "dimension", "disabled", "flow", "outcome", "policy", "replayed", "retryAfterSeconds", "status"]);
const SECRET_KEY = /(password|token|cookie|secret|authorization|email|ip|prompt|response|medical|oauth|captcha)/i;

export function allowlistedMetadata(value?: Record<string, unknown>) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (!METADATA_KEYS.has(key) || SECRET_KEY.test(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 120);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean" || item === null) output[key] = item;
  }
  return output;
}

export function safeOperationalIdentifier(value?: string) {
  if (!value) return undefined;
  const secret = process.env.FURVISE_OPERATIONS_HASH_SECRET || process.env.FURVISE_RATE_LIMIT_HASH_SECRET || "";
  if (secret.length < 32) return "present";
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 16);
}
