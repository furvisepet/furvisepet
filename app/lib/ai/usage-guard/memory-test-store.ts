import type { AiDailySnapshot, AiGuardStore } from "./types";

export class MemoryAiGuardTestStore implements AiGuardStore {
  private calls = new Map<string, { cost: number; day: string; feature: string; operationId: string; started: boolean; state: string }>();
  private operations = new Map<string, { fingerprint: string; state: string }>();
  private operationCalls = new Map<string, number>();
  private snapshots = new Map<string, AiDailySnapshot>();
  private emergency = { disabled: false, reason: null as string | null, updatedAt: null as string | null };

  setEmergency(disabled: boolean, reason: string | null = null) { this.emergency = { disabled, reason, updatedAt: new Date().toISOString() }; }
  async emergencyStatus() { return this.emergency; }
  async admitOperation(input: { fingerprint: string; key: string }) {
    const existing = this.operations.get(input.key);
    if (!existing) { this.operations.set(input.key, { fingerprint: input.fingerprint, state: "admitted" }); return "created" as const; }
    if (existing.fingerprint !== input.fingerprint) return "conflict" as const;
    return existing.state === "completed" ? "completed" as const : "reused" as const;
  }
  async completeOperation(input: { key: string }) { const item = this.operations.get(input.key); if (item) item.state = "completed"; }
  async failOperation(input: { key: string }) { const item = this.operations.get(input.key); if (item && item.state !== "completed") item.state = "failed"; }
  async reserveCall(input: { callId: string; callLimit: number; costLimitMicrodollars: number; day: string; feature: string; maximumOperationCalls: number; operationCallTtlSeconds: number; operationId: string; reservedCostMicrodollars: number }) {
    const existing = this.calls.get(input.callId);
    const snapshot = this.snapshots.get(input.day) || { calls: 0, costMicrodollars: 0 };
    if (existing) return { allowed: true as const, reused: true, snapshot: { ...snapshot } };
    if ((this.operationCalls.get(input.operationId) || 0) >= input.maximumOperationCalls) return { allowed: false as const, reason: "operation_call_limit" as const, snapshot: { ...snapshot } };
    if (snapshot.calls + 1 > input.callLimit) return { allowed: false as const, reason: "daily_call_limit" as const, snapshot: { ...snapshot } };
    if (snapshot.costMicrodollars + input.reservedCostMicrodollars > input.costLimitMicrodollars) return { allowed: false as const, reason: "daily_cost_limit" as const, snapshot: { ...snapshot } };
    snapshot.calls += 1; snapshot.costMicrodollars += input.reservedCostMicrodollars;
    this.snapshots.set(input.day, snapshot);
    this.calls.set(input.callId, { cost: input.reservedCostMicrodollars, day: input.day, feature: input.feature, operationId: input.operationId, started: false, state: "reserved" });
    this.operationCalls.set(input.operationId, (this.operationCalls.get(input.operationId) || 0) + 1);
    return { allowed: true as const, reused: false, snapshot: { ...snapshot } };
  }
  async markCallStarted(input: { callId: string }) { const item = this.calls.get(input.callId); if (!item) throw new Error("CALL_RESERVATION_MISSING"); item.started = true; item.state = "started"; }
  async reconcileCall(input: { actualCostMicrodollars: number; callId: string }) {
    const item = this.calls.get(input.callId); if (!item) throw new Error("CALL_RESERVATION_MISSING");
    const snapshot = this.snapshots.get(item.day)!; snapshot.costMicrodollars += input.actualCostMicrodollars - item.cost;
    item.cost = input.actualCostMicrodollars; item.state = "completed"; return { ...snapshot };
  }
  async releaseUnstartedCall(input: { callId: string }) {
    const item = this.calls.get(input.callId); if (!item || item.started) return;
    const snapshot = this.snapshots.get(item.day)!; snapshot.calls -= 1; snapshot.costMicrodollars -= item.cost; this.calls.delete(input.callId);
    this.operationCalls.set(item.operationId, Math.max(0, (this.operationCalls.get(item.operationId) || 1) - 1));
  }
  getSnapshot(day: string) { return { ...(this.snapshots.get(day) || { calls: 0, costMicrodollars: 0 }) }; }
}
