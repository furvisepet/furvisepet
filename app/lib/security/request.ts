import "server-only";

export const API_BODY_LIMITS = {
  ask: 64 * 1024,
  conversation: 384 * 1024,
  productAi: 64 * 1024,
  vetBrief: 384 * 1024,
  standard: 64 * 1024,
} as const;

export class RequestBoundaryError extends Error {
  constructor(public code: "INVALID_JSON" | "PAYLOAD_TOO_LARGE") {
    super(code);
    this.name = "RequestBoundaryError";
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBoundaryError("PAYLOAD_TOO_LARGE");
  }

  if (!request.body) throw new RequestBoundaryError("INVALID_JSON");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new RequestBoundaryError("PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestBoundaryError) throw error;
    throw new RequestBoundaryError("INVALID_JSON");
  } finally {
    reader.releaseLock();
  }
}

export function hasOnlyKeys(value: unknown, allowedKeys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function inclusiveDateSpanDays(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}
