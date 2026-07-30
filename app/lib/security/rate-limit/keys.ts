import { createHash, createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { RateLimitPolicyName } from "./types";

const KEY_VERSION = "furvise:v1";

export function resolveClientIp(
  request: Request,
  options: { platform?: "vercel" | "test" | "untrusted"; directIp?: string | null } = {},
) {
  const platform = options.platform || (process.env.VERCEL === "1" ? "vercel" : "untrusted");
  if (platform === "test") return normalizeIpAddress(options.directIp || "");
  if (platform !== "vercel" || !request.headers.get("x-vercel-id")) return null;
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "";
  if (forwarded.includes(",")) return null;
  return normalizeIpAddress(forwarded);
}

export function normalizeIpAddress(value: string) {
  let candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  if (candidate.startsWith("[") && candidate.endsWith("]")) candidate = candidate.slice(1, -1);
  if (candidate.startsWith("::ffff:") && isIP(candidate.slice(7)) === 4) return candidate.slice(7);
  const version = isIP(candidate);
  if (version === 4) return candidate.split(".").map((part) => String(Number(part))).join(".");
  if (version !== 6) return null;
  try {
    return new URL(`http://[${candidate}]`).hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function hashRateLimitIdentity(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function fingerprintRateLimitPayload(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function getRateLimitRequestId(request: Request, candidate?: unknown) {
  if (typeof candidate === "string" && isUuid(candidate)) return candidate;
  const header = request.headers.get("x-request-id");
  return header && isUuid(header) ? header : randomUUID();
}

export function createRateLimitKeys(input: {
  hashSecret: string;
  idempotencyKey?: string;
  ipAddress: string | null;
  policy: RateLimitPolicyName;
  userId: string;
}) {
  const userHash = hashRateLimitIdentity(`user:${input.userId}`, input.hashSecret);
  const ipHash = hashRateLimitIdentity(`ip:${input.ipAddress || "unresolved"}`, input.hashSecret);
  const operationHash = input.idempotencyKey
    ? hashRateLimitIdentity(`operation:${input.idempotencyKey}`, input.hashSecret)
    : "";
  return {
    hashedIpPrefix: ipHash.slice(0, 12),
    ipDedupeKey: operationHash ? `${KEY_VERSION}:dedupe:${input.policy}:ip:${ipHash}:${operationHash}` : undefined,
    ipKey: `${KEY_VERSION}:rate:${input.policy}:ip:${ipHash}`,
    leaseKey: `${KEY_VERSION}:lease:ai:user:${userHash}`,
    member: `${Date.now()}:${randomUUID()}`,
    userDedupeKey: operationHash ? `${KEY_VERSION}:dedupe:${input.policy}:user:${userHash}:${operationHash}` : undefined,
    userKey: `${KEY_VERSION}:rate:${input.policy}:user:${userHash}`,
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
