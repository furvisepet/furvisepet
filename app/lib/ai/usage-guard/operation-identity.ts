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
