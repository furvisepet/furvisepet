import type { RecoveryAuthorizationState, RecoveryAuthorizationStore } from "./recovery-authorization-types";

export class MemoryRecoveryAuthorizationStore implements RecoveryAuthorizationStore {
  readonly values = new Map<string, { expiresAt: number; value: string }>();
  private readonly now: () => number;
  constructor(now: () => number = () => Date.now()) { this.now = now; }
  async issue(input: { key: string; ttlMs: number; userHash: string }) {
    if (this.live(input.key)) return false;
    this.values.set(input.key, { expiresAt: this.now() + input.ttlMs, value: `ready:${input.userHash}` });
    return true;
  }
  async inspect(input: { key: string; userHash: string }): Promise<RecoveryAuthorizationState> {
    const record = this.live(input.key);
    if (!record) return "expired";
    if (record.value === `ready:${input.userHash}`) return "ready";
    if (record.value.startsWith(`processing:${input.userHash}:`)) return "processing";
    if (record.value.startsWith(`consumed:${input.userHash}:`)) return "consumed";
    return "invalid";
  }
  async claim(input: { key: string; operationHash: string; userHash: string }) {
    const record = this.live(input.key);
    if (!record) return "expired" as const;
    if (record.value.startsWith(`processing:${input.userHash}:`)) return "processing" as const;
    if (record.value.startsWith(`consumed:${input.userHash}:`)) return "consumed" as const;
    if (record.value !== `ready:${input.userHash}`) return "invalid" as const;
    record.value = `processing:${input.userHash}:${input.operationHash}`;
    return "claimed" as const;
  }
  async consume(input: { key: string; operationHash: string; userHash: string }) {
    const record = this.live(input.key);
    if (!record || record.value !== `processing:${input.userHash}:${input.operationHash}`) return false;
    record.value = `consumed:${input.userHash}:${input.operationHash}`;
    return true;
  }
  async release(input: { key: string; operationHash: string; userHash: string }) {
    const record = this.live(input.key);
    if (!record || record.value !== `processing:${input.userHash}:${input.operationHash}`) return false;
    record.value = `ready:${input.userHash}`;
    return true;
  }
  private live(key: string) {
    const record = this.values.get(key);
    if (!record || record.expiresAt <= this.now()) { this.values.delete(key); return null; }
    return record;
  }
}
