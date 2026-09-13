import { MAX_VET_BRIEF_REASON_LENGTH } from "./request.ts";
type Scope = { userId: string; petId: string };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PendingInput = { purpose: string; from: string; to: string };
const lifetimeMs = 30 * 60 * 1000;
const key = (scope: Scope) => `furvise:vet-brief:pending-input:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.petId)}`;
/** Temporary appointment input only, not a saved generated report. Read only
 * after the server revalidates the same owner's pet and Plus entitlement. */
export function savePendingVetBriefInput(storage: Store, scope: Scope, input: PendingInput, now = Date.now()) {
  if (!scope.userId || !scope.petId || !input.purpose.trim() || input.purpose.length > MAX_VET_BRIEF_REASON_LENGTH) return;
  try { storage.setItem(key(scope), JSON.stringify({ ...input, ...scope, expiresAt: now + lifetimeMs })); } catch { /* generation can proceed if temporary storage is unavailable */ }
}
export function readPendingVetBriefInput(storage: Store, scope: Scope, now = Date.now()): PendingInput | null {
  try {
    const value = JSON.parse(storage.getItem(key(scope)) || "null");
    if (!value || value.userId !== scope.userId || value.petId !== scope.petId || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + lifetimeMs || typeof value.purpose !== "string" || value.purpose.length > MAX_VET_BRIEF_REASON_LENGTH || !value.purpose.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(value.from) || !/^\d{4}-\d{2}-\d{2}$/.test(value.to) || value.from > value.to) {
      storage.removeItem(key(scope)); return null;
    }
    return { purpose: value.purpose, from: value.from, to: value.to };
  } catch { return null; }
}
export function removePendingVetBriefInput(storage: Store, scope: Scope) {
  try { storage.removeItem(key(scope)); } catch { /* best-effort temporary cleanup */ }
}
