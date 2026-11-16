"use client";

const PREFIX = "furvise:idempotency:v1:";
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

export function getOrCreateClientMutationKey(scope: string) {
  return getOrCreateStoredMutationKey(`${PREFIX}${safeScope(scope)}`);
}

function getOrCreateStoredMutationKey(storageKey: string) {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { key?: unknown; createdAt?: unknown };
      if (typeof parsed.key === "string" && typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt < MAX_PENDING_AGE_MS) return parsed.key;
      window.sessionStorage.removeItem(storageKey);
    }
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, JSON.stringify({ createdAt: Date.now(), key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearClientMutationKey(scope: string, key: string) {
  clearStoredMutationKey(`${PREFIX}${safeScope(scope)}`, key);
}

function clearStoredMutationKey(storageKey: string, key: string) {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored && (JSON.parse(stored) as { key?: unknown }).key === key) window.sessionStorage.removeItem(storageKey);
  } catch { /* Storage availability must not break a completed action. */ }
}

export async function idempotentClientFetch(url: string, init: RequestInit, scope: string, explicitKey?: string) {
  return fetchWithStoredMutationKey(url, init, `${PREFIX}${safeScope(scope)}`, explicitKey);
}

// A revision-guarded edit is a distinct intent only when its exact confirmed body changes.
// Retain prior ambiguous intents; never rotate a key in response to an error.
export async function idempotentRevisionClientFetch(url: string, init: RequestInit, scope: string) {
  if (typeof init.body !== "string") throw new Error("A confirmed edit body is required.");
  // Length framing is unambiguous; hash in memory and persist only the digest/key metadata.
  const framed = [scope, url, (init.method || "GET").toUpperCase(), init.body].map(value => value.length + ":" + value).join("");
  const bytes = new TextEncoder().encode(framed);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return fetchWithStoredMutationKey(url, init, `${PREFIX}revision-v1:${identity}`);
}

async function fetchWithStoredMutationKey(url: string, init: RequestInit, storageKey: string, explicitKey?: string) {
  const key = explicitKey || getOrCreateStoredMutationKey(storageKey);
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key);
  const response = await fetch(url, { ...init, headers });
  if (await isCanonicalCompletion(response)) clearStoredMutationKey(storageKey, key);
  return response;
}

async function isCanonicalCompletion(response: Response) {
  if (response.status >= 500 || response.status === 429) return false;
  if (response.status !== 409) return true;
  const payload = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return payload?.code !== "REQUEST_IN_PROGRESS" && payload?.code !== "AI_REQUEST_ALREADY_ACTIVE" && payload?.code !== "ANSWER_ALREADY_ACTIVE";
}

function safeScope(scope: string) {
  let hash = 2166136261;
  for (let index = 0; index < scope.length; index += 1) hash = Math.imul(hash ^ scope.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
