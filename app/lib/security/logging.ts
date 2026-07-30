import "server-only";

const sensitiveKey = /authorization|cookie|password|secret|token|api.?key|session|code|conversation|content|history|message|note|response/i;

export function redactLogContext(context: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    key,
    sensitiveKey.test(key) ? "[REDACTED]" : safeScalar(value),
  ]));
}

export function safeErrorForLog(error: unknown) {
  const value = error as { code?: unknown; name?: unknown; status?: unknown } | null;
  return {
    errorCode: typeof value?.code === "string" ? value.code.slice(0, 80) : "",
    errorName: typeof value?.name === "string" ? value.name.slice(0, 80) : error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
    errorStatus: typeof value?.status === "number" ? value.status : null,
  };
}

function safeScalar(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 160);
  if (Array.isArray(value)) return { count: value.length };
  return value && typeof value === "object" ? "[OBJECT]" : String(value ?? "").slice(0, 160);
}
