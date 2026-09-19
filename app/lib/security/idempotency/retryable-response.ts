/** An Ask admission refusal is not a completed answer. Other operations retain
 * their existing response policy, including terminal conflict responses. */
export function isRetryableOperationResponse(operationType: string, status: number, body: unknown): boolean {
  if (status >= 500) return true;
  if (operationType !== "ask.submit.persisted_answer_v2" || !body || typeof body !== "object") return false;
  const value = body as { success?: unknown; code?: unknown };
  return value.success === false && (
    ((status === 409 || status === 429) && value.code === "RATE_LIMIT")
    || (status === 409 && value.code === "ANSWER_ALREADY_ACTIVE")
    || (status === 429 && value.code === "TEMPORARY_PROVIDER_FAILURE")
  );
}
