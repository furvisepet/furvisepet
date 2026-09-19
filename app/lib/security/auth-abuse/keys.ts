import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import type { AuthFlow, AuthLimitPolicyName } from "./types";

const VERSION = "furvise:v1:auth";

export function createAuthAbuseKeys(input: { email: string | null; hashSecret: string; ipAddress: string | null; policy: AuthLimitPolicyName }) {
  const ipHash = hmac(`ip:${input.ipAddress || "unresolved"}`, input.hashSecret);
  const emailHash = input.email ? hmac(`email:${input.email}`, input.hashSecret) : null;
  return {
    dailyIpKey: `${VERSION}:rate:${input.policy}:ip-day:${ipHash}`,
    emailFailureKey: emailHash ? `${VERSION}:failure:AUTH_LOGIN:email:${emailHash}` : null,
    emailKey: emailHash ? `${VERSION}:rate:${input.policy}:email:${emailHash}` : null,
    hashedEmailPrefix: emailHash?.slice(0, 12) || null,
    hashedIpPrefix: ipHash.slice(0, 12),
    ipKey: `${VERSION}:rate:${input.policy}:ip:${ipHash}`,
    member: `${Date.now()}:${randomUUID()}`,
  };
}

export function createAuthOperationIdentity(input: { email: string; flow: AuthFlow; hashSecret: string; idempotencyKey: string; semanticSecret?: string }) {
  const emailHash = hmac(`email:${input.email}`, input.hashSecret);
  const keyHash = hmac(`request:${input.idempotencyKey}`, input.hashSecret);
  return {
    fingerprint: hmac(JSON.stringify({ email: input.email, flow: input.flow, semanticSecret: input.semanticSecret || "" }), input.hashSecret),
    key: `${VERSION}:operation:${input.flow}:${emailHash}:${keyHash}`,
  };
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
