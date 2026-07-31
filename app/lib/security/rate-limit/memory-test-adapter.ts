import type { RateLimitAdapter, RateLimitAdapterDecision } from "./types";

export class MemoryRateLimitTestAdapter implements RateLimitAdapter {
  private readonly buckets = new Map<string, Array<{ member: string; timestamp: number }>>();
  private readonly dedupe = new Map<string, { expiresAt: number; fingerprint: string }>();
  private readonly leases = new Map<string, { expiresAt: number; ownerToken: string }>();

  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async check(input: {
    dedupeKey?: string;
    fingerprint?: string;
    key: string;
    limit: number;
    member: string;
    nowMs: number;
    windowMs: number;
  }): Promise<RateLimitAdapterDecision> {
    const fingerprint = input.fingerprint || "same-operation";
    const existing = input.dedupeKey ? this.dedupe.get(input.dedupeKey) : null;
    if (existing && existing.expiresAt > input.nowMs) {
      if (existing.fingerprint !== fingerprint) return { allowed: false, conflict: true, remaining: 0, retryAfterMs: 0, reused: false };
      return { allowed: true, conflict: false, remaining: -1, retryAfterMs: 0, reused: true };
    }
    const active = (this.buckets.get(input.key) || []).filter((entry) => entry.timestamp > input.nowMs - input.windowMs);
    this.buckets.set(input.key, active);
    if (active.length >= input.limit) {
      return { allowed: false, conflict: false, remaining: 0, retryAfterMs: Math.max(1, active[0].timestamp + input.windowMs - input.nowMs), reused: false };
    }
    active.push({ member: input.member, timestamp: input.nowMs });
    if (input.dedupeKey) this.dedupe.set(input.dedupeKey, { expiresAt: input.nowMs + input.windowMs, fingerprint });
    return { allowed: true, conflict: false, remaining: input.limit - active.length, retryAfterMs: 0, reused: false };
  }

  async acquireLease(input: { key: string; ownerToken: string; ttlMs: number }) {
    const now = this.now();
    const current = this.leases.get(input.key);
    if (current && current.expiresAt > now) return { acquired: false, retryAfterMs: current.expiresAt - now };
    this.leases.set(input.key, { expiresAt: now + input.ttlMs, ownerToken: input.ownerToken });
    return { acquired: true, retryAfterMs: 0 };
  }

  async releaseLease(input: { key: string; ownerToken: string }) {
    const current = this.leases.get(input.key);
    if (!current || current.ownerToken !== input.ownerToken) return false;
    this.leases.delete(input.key);
    return true;
  }
}
