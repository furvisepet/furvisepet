import "server-only";

import { createHash } from "node:crypto";

const TRANSPORT_FIELDS = new Set(["requestId", "idempotencyKey", "idempotency_key"]);

export function hashIdempotencyPayload(operationType: string, payload: unknown) {
  return createHash("sha256").update(canonicalJson({ operationVersion: 1, operationType, payload })).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => !TRANSPORT_FIELDS.has(key) && record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
