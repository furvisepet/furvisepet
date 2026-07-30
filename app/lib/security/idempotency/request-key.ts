import "server-only";

import { randomUUID } from "node:crypto";

export const IDEMPOTENCY_HEADER = "idempotency-key";

export function resolveIdempotencyKey(request: Request, candidate?: unknown):
  | { error: "invalid" | "conflict" | "required" }
  | { key: string; source: "header" | "legacy_body" } {
  const rawHeader = request.headers.get(IDEMPOTENCY_HEADER)?.trim() || "";
  const candidateKey = typeof candidate === "string" ? candidate.trim() : "";
  if (rawHeader && !isIdempotencyKey(rawHeader)) return { error: "invalid" as const };
  if (candidateKey && !isIdempotencyKey(candidateKey)) return { error: "invalid" as const };
  if (rawHeader && candidateKey && rawHeader.toLowerCase() !== candidateKey.toLowerCase()) return { error: "conflict" as const };
  if (rawHeader) return { key: rawHeader.toLowerCase(), source: "header" as const };
  if (candidateKey) return { key: candidateKey.toLowerCase(), source: "legacy_body" as const };
  return { error: "required" as const };
}

export function createIdempotencyKey() {
  return randomUUID();
}

export function isIdempotencyKey(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
