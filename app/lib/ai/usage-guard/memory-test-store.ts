import type { AiDailySnapshot, AiGuardStore } from "./types";

export class MemoryAiGuardTestStore implements AiGuardStore {
  private calls = new Map<string, { cost: number; day: string; feature: string; operationId: string; started: boolean; state: string; qualification: boolean }>();
  private operations = new Map<string, { fingerprint: string; state: string }>();
  private operationCalls = new Map<string, number>();
  private snapshots = new Map<string, AiDailySnapshot>();
  private emergency = { disabled: false, reason: null as string | null, updatedAt: null as string | null };
  // Same in-memory instance models a persistent shared Redis ledger across dates and requests.
  private qualificationTotal: number | null = null;
  seedQualificationLedger(initialMicrodollars = 0) {
    if (this.qualificationTotal !== null || !Number.isSafeInteger(initialMicrodollars) || initialMicrodollars < 0) throw new Error("QUALIFICATION_LEDGER_ALREADY_SET_OR_INVALID");
    this.qualificationTotal = initialMicrodollars;
  }
  getQualificationTotal() { return this.qualificationTotal; }
  simulateQualificationLedgerLoss() { this.qualificationTotal = null; }

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
  async reserveCall(input: { callId: string; callLimit: number; costLimitMicrodollars: number; day: string; feature: string; maximumOperationCalls: number; operationCallTtlSeconds: number; operationId: string; reservedCostMicrodollars: number; qualificationLimitMicrodollars?: number }) {
    const existing = this.calls.get(input.callId);
    const snapshot = this.snapshots.get(input.day) || { calls: 0, costMicrodollars: 0 };
    if (existing) return { allowed: true as const, reused: true, snapshot: { ...snapshot } };
    if ((this.operationCalls.get(input.operationId) || 0) >= input.maximumOperationCalls) return { allowed: false as const, reason: "operation_call_limit" as const, snapshot: { ...snapshot } };
    if (snapshot.calls + 1 > input.callLimit) return { allowed: false as const, reason: "daily_call_limit" as const, snapshot: { ...snapshot } };
    if (snapshot.costMicrodollars + input.reservedCostMicrodollars > input.costLimitMicrodollars) return { allowed: false as const, reason: "daily_cost_limit" as const, snapshot: { ...snapshot } };
    const qualification = (input.qualificationLimitMicrodollars ?? 0) > 0;
    if (qualification && (this.qualificationTotal === null || this.qualificationTotal + input.reservedCostMicrodollars > input.qualificationLimitMicrodollars!))
      return { allowed: false as const, reason: "qualification_total_limit" as const, snapshot: { ...snapshot } };
    snapshot.calls += 1; snapshot.costMicrodollars += input.reservedCostMicrodollars;
    if (qualification) this.qualificationTotal! += input.reservedCostMicrodollars;
    this.snapshots.set(input.day, snapshot);
    this.calls.set(input.callId, { cost: input.reservedCostMicrodollars, day: input.day, feature: input.feature, operationId: input.operationId, started: false, state: "reserved", qualification });
    this.operationCalls.set(input.operationId, (this.operationCalls.get(input.operationId) || 0) + 1);
    return { allowed: true as const, reused: false, snapshot: { ...snapshot } };
  }
  async reserveWholeAsk(input: {
    callIds: string[]; operationId: string; day: string; ttlSeconds: number; operationTtlSeconds: number;
    callLimit: number; costLimitMicrodollars: number; qualificationLimitMicrodollars: number;
    perCallMicrodollars: number;
  }) {
    const snapshot = this.snapshots.get(input.day) || { calls: 0, costMicrodollars: 0 };
    const deny = (reason: "daily_call_limit" | "daily_cost_limit" | "qualification_total_limit" | "operation_conflict" | "operation_invalid") =>
      ({ allowed: false as const, reason, snapshot: { ...snapshot } });
    const slots = input.callIds.length, amount = slots * input.perCallMicrodollars;
    if (slots !== 6 || new Set(input.callIds).size !== 6 || !Number.isSafeInteger(amount) || amount < 1) return deny("operation_invalid");
    if (this.emergency.disabled) return { allowed: false as const, reason: "emergency_disabled" as const, snapshot: { ...snapshot } };
    if (input.callIds.some(id => this.calls.has(id))
      || (this.operationCalls.get(input.operationId) || 0) !== 0) return deny("operation_conflict");
    if (snapshot.calls + slots > input.callLimit) return deny("daily_call_limit");
    if (snapshot.costMicrodollars + amount > input.costLimitMicrodollars) return deny("daily_cost_limit");
    if (this.qualificationTotal === null || this.qualificationTotal + amount > input.qualificationLimitMicrodollars)
      return deny("qualification_total_limit");
    snapshot.calls += slots; snapshot.costMicrodollars += amount;
    this.snapshots.set(input.day,snapshot);this.qualificationTotal += amount;
    this.operationCalls.set(input.operationId,slots);
    for (const callId of input.callIds) this.calls.set(callId, {
      cost: input.perCallMicrodollars, day: input.day, feature: "ask",
      operationId: input.operationId, started: false, state: "reserved", qualification: true,
    });
    return { allowed: true as const, snapshot: { ...snapshot } };
  }
  async markCallStarted(input: { callId: string }) { const item = this.calls.get(input.callId); if (!item) throw new Error("CALL_RESERVATION_MISSING"); item.started = true; item.state = "started"; }
  async reconcileCall(input: { actualCostMicrodollars: number; callId: string }) {
    const item = this.calls.get(input.callId); if (!item) throw new Error("CALL_RESERVATION_MISSING");
    const snapshot = this.snapshots.get(item.day)!;
    if (item.state === "completed") return { ...snapshot };
    if (!Number.isSafeInteger(input.actualCostMicrodollars) || input.actualCostMicrodollars < 0) throw new Error("INVALID_COST");
    if (item.qualification && this.qualificationTotal === null) { this.setEmergency(true, "qualification_ledger_missing"); throw new Error("QUALIFICATION_LEDGER_MISSING"); }
    snapshot.costMicrodollars += input.actualCostMicrodollars - item.cost;
    if (item.qualification) {
      this.qualificationTotal! += input.actualCostMicrodollars - item.cost;
      if (input.actualCostMicrodollars > item.cost) this.setEmergency(true, "qualification_cost_underreserved");
    }
    item.cost = input.actualCostMicrodollars; item.state = "completed";
    if (item.qualification && this.emergency.disabled) throw new Error("QUALIFICATION_UNDERRESERVED");
    return { ...snapshot };
  }
  async releaseUnstartedCall(input: { callId: string }) {
    const item = this.calls.get(input.callId); if (!item || item.started) return;
    const snapshot = this.snapshots.get(item.day)!; snapshot.calls -= 1; snapshot.costMicrodollars -= item.cost;
    if (item.qualification && this.qualificationTotal !== null) this.qualificationTotal -= item.cost;
    this.calls.delete(input.callId);
    this.operationCalls.set(item.operationId, Math.max(0, (this.operationCalls.get(item.operationId) || 1) - 1));
  }
  getSnapshot(day: string) { return { ...(this.snapshots.get(day) || { calls: 0, costMicrodollars: 0 }) }; }
}
