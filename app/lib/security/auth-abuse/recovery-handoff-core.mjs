import { randomBytes, timingSafeEqual } from "node:crypto";
import { createRecoveryHandoffIdentity } from "./recovery-secrets.mjs";

const MARKER_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[a-f0-9]{64}$/;

export async function issueRecoveryHandoffInStore({ secret, store, ttlMs }) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const marker = randomBytes(32).toString("base64url");
    const id = createRecoveryHandoffIdentity(marker, secret);
    if (id && await store.issue({ key: id, ttlMs })) return { id, marker };
  }
  return null;
}

export async function consumeRecoveryHandoffInStore({ id, marker, secret, store }) {
  if (typeof secret !== "string" || secret.length < 32 || !MARKER_PATTERN.test(marker) || !ID_PATTERN.test(id)) return false;
  const expected = createRecoveryHandoffIdentity(marker, secret);
  if (!expected || !safeEqual(expected, id)) return false;
  return store.consume({ key: id });
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
