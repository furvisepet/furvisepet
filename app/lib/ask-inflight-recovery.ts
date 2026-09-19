import { ASK_CLIENT_TIMEOUT_MS } from "./ai/ask-execution-limits.ts";

const KEY = "furvise:ask:pending-first-turn:v1";
const TTL_MS = ASK_CLIENT_TIMEOUT_MS + 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PendingAskRecovery = { requestId: string; petId: string; startedAt: number; conversationId?: string };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function persistPendingAskRecovery(storage: StorageLike, value: PendingAskRecovery) {
  if (!UUID.test(value.requestId) || !UUID.test(value.petId) || !Number.isFinite(value.startedAt)
    || value.conversationId !== undefined && !UUID.test(value.conversationId)) return;
  try { storage.setItem(KEY, JSON.stringify(value)); } catch { /* recovery remains optional */ }
}

export function readPendingAskRecovery(storage: StorageLike, now = Date.now()): PendingAskRecovery | null {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "null") as PendingAskRecovery | null;
    if (!parsed || !UUID.test(parsed.requestId) || !UUID.test(parsed.petId) || !Number.isFinite(parsed.startedAt)
      || parsed.conversationId !== undefined && !UUID.test(parsed.conversationId)
      || parsed.startedAt > now + 5_000 || now - parsed.startedAt > TTL_MS) {
      storage.removeItem(KEY); return null;
    }
    return parsed;
  } catch { try { storage.removeItem(KEY); } catch {} return null; }
}

export function clearPendingAskRecovery(storage: StorageLike, requestId?: string) {
  try {
    if (requestId) {
      const current = JSON.parse(storage.getItem(KEY) || "null") as PendingAskRecovery | null;
      if (current?.requestId && current.requestId !== requestId) return;
    }
    storage.removeItem(KEY);
  } catch { /* storage failure cannot change request authority */ }
}
