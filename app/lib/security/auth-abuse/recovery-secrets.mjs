import { createHmac } from "node:crypto";

export function createRecoveryPasswordCommitment(password, secret) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  // The idempotency payload contains only this keyed commitment. A plain password
  // hash would permit offline guessing if the operation table were disclosed.
  return hmac(`password-commitment\0${password}`, secret);
}

export function createRecoveryMarkerIdentity(marker, userId, sessionToken, secret, operationKey = "") {
  return {
    markerHash: hmac(`marker:${marker}`, secret),
    operationHash: hmac(`operation:${operationKey}`, secret),
    userHash: hmac(`user:${userId}\0session:${sessionToken}`, secret),
  };
}

function hmac(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
