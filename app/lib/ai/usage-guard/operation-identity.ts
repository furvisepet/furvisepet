import { createHmac } from "node:crypto";

export function deriveAiGuardOperationId(input: {
  executionPhase?: "initial" | "retry";
  requestId: string;
  secret: string;
  userId: string;
}) {
  const identity = input.executionPhase
    ? `${input.userId}:${input.requestId}:phase:${input.executionPhase}`
    : `${input.userId}:${input.requestId}`;
  return createHmac("sha256", input.secret).update(identity).digest("hex");
}
