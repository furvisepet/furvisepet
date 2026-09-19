import type { RecoveryHandoffStore } from "./recovery-handoff-types";

export class MemoryRecoveryHandoffStore implements RecoveryHandoffStore {
  readonly values = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) { this.now = now; }

  async issue(input: { key: string; ttlMs: number }) {
    if (this.live(input.key)) return false;
    this.values.set(input.key, this.now() + input.ttlMs);
    return true;
  }

  async consume(input: { key: string }) {
    if (!this.live(input.key)) return false;
    this.values.delete(input.key);
    return true;
  }

  private live(key: string) {
    const expiresAt = this.values.get(key);
    if (!expiresAt || expiresAt <= this.now()) {
      this.values.delete(key);
      return false;
    }
    return true;
  }
}
