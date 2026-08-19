import { createHash } from "node:crypto";

/**
 * A conversation request keeps one stable id for message/idempotency records, while
 * every retry after a released credit reservation gets a distinct ledger id.
 */
export function deriveAskCreditAttemptId(requestId: string, ownerToken: string) {
  const digest = createHash("sha256")
    .update(`ask-credit-attempt:${requestId}:${ownerToken}`)
    .digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(digest[16], 16) % 4];
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
