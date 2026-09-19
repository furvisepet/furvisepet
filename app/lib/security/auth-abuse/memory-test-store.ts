import type { AuthAbuseStore } from "./types";

export class MemoryAuthAbuseTestStore implements AuthAbuseStore {
  private readonly windows = new Map<string, number[]>();
  private readonly claims = new Map<string, { fingerprint: string; expiresAt: number }>();
  async check(input: { key: string; limit: number; member: string; nowMs: number; windowMs: number }) {
    void input.member;
    const values = (this.windows.get(input.key) || []).filter((time) => time > input.nowMs - input.windowMs);
    this.windows.set(input.key, values);
    if (values.length >= input.limit) return { allowed: false, count: values.length, retryAfterMs: Math.max(1, values[0] + input.windowMs - input.nowMs) };
    values.push(input.nowMs);
    return { allowed: true, count: values.length, retryAfterMs: 0 };
  }
  async claim(input: { fingerprint: string; key: string; ttlMs: number }) {
    const now = Date.now(); const existing = this.claims.get(input.key);
    if (existing && existing.expiresAt > now) return existing.fingerprint === input.fingerprint ? "replay" as const : "conflict" as const;
    this.claims.set(input.key, { expiresAt: now + input.ttlMs, fingerprint: input.fingerprint }); return "new" as const;
  }
  async clear(key: string) { this.windows.delete(key); this.claims.delete(key); }
  async state(input: { key: string; nowMs: number; windowMs: number }) {
    const values = (this.windows.get(input.key) || []).filter((time) => time > input.nowMs - input.windowMs); this.windows.set(input.key, values);
    return { count: values.length, retryAfterMs: values.length ? Math.max(1, values[0] + input.windowMs - input.nowMs) : 0 };
  }
}
