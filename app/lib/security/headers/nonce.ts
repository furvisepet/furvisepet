import { randomBytes } from "node:crypto";

export function createCspNonce() {
  return randomBytes(18).toString("base64url");
}

export function isValidCspNonce(value: string) {
  return /^[A-Za-z0-9_-]{24,}$/.test(value);
}
