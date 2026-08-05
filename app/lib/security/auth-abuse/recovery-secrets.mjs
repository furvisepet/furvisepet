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

export function createRecoveryContinuationIdentity(token, secret) {
  if (typeof token !== "string" || typeof secret !== "string" || secret.length < 32) return null;
  // Only this keyed identity is stored in the replay gate. The Supabase token
  // and its containing confirmation URL must never enter Redis or logs.
  return hmac(`recovery-continuation:${token}`, secret);
}

export function createRecoveryHandoffIdentity(marker, secret) {
  if (typeof marker !== "string" || typeof secret !== "string" || secret.length < 32) return null;
  return hmac(`recovery-handoff:${marker}`, secret);
}

function hmac(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
