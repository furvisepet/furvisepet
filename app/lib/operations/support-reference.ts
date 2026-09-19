export function buildSupportReference(input: { code: string; operationId?: string; requestId: string; timestamp?: string }) {
  return {
    code: input.code.replace(/[^A-Z0-9_]/g, "").slice(0, 64) || "UNKNOWN",
    operationId: input.operationId?.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64),
    requestId: input.requestId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64),
    timestamp: input.timestamp || new Date().toISOString(),
  };
}
