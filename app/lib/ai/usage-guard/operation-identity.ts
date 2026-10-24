import { createHmac } from "node:crypto";

export function deriveAiGuardOperationId(input: {
  feature: string;
  requestId: string;
  secret: string;
  userId: string;
}) {
  const identity = `${input.userId}:${input.feature}:${input.requestId}`;
  return createHmac("sha256", input.secret).update(identity).digest("hex");
}
/** Separate domain from operation identity. Server-only binding; never a client-selected key. */
export function deriveAiGuardOwnerScope(input: { userId: string; secret: string }) {
  return createHmac("sha256", input.secret).update("owner-call-observation:v1:" + input.userId).digest("hex");
}
