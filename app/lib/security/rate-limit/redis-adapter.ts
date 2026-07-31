import { Redis } from "@upstash/redis";
import type { RateLimitAdapter, RateLimitAdapterDecision } from "./types";

const RATE_LIMIT_SCRIPT = `
local existing = nil
if KEYS[2] ~= '' then existing = redis.call('GET', KEYS[2]) end
if existing then
  if existing ~= ARGV[6] then return {0, 0, 0, 0, 1} end
  return {1, -1, 0, 1, 0}
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = tonumber(ARGV[2])
  if oldest[2] then retry = math.max(1, tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1])) end
  return {0, 0, retry, 0, 0}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) + 1000)
if KEYS[2] ~= '' then redis.call('SET', KEYS[2], ARGV[6], 'PX', ARGV[2], 'NX') end
return {1, tonumber(ARGV[3]) - count - 1, 0, 0, 0}
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

export class RedisRateLimitAdapter implements RateLimitAdapter {
  private readonly redis: Redis;

  constructor(input: { token: string; url: string; timeoutMs: number }) {
    this.redis = new Redis({
      retry: { retries: 0 },
      signal: () => AbortSignal.timeout(input.timeoutMs),
      token: input.token,
      url: input.url,
    });
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
    const result = await this.redis.eval<string[], number[]>(RATE_LIMIT_SCRIPT, [input.key, input.dedupeKey || ""], [
      String(input.nowMs),
      String(input.windowMs),
      String(input.limit),
      input.member,
      input.dedupeKey || "",
      input.fingerprint || "same-operation",
    ]);
    return {
      allowed: result[0] === 1,
      conflict: result[4] === 1,
      remaining: Number(result[1] || 0),
      retryAfterMs: Number(result[2] || 0),
      reused: result[3] === 1,
    };
  }

  async acquireLease(input: { key: string; ownerToken: string; ttlMs: number }) {
    const acquired = await this.redis.set(input.key, input.ownerToken, { nx: true, px: input.ttlMs });
    if (acquired === "OK") return { acquired: true, retryAfterMs: 0 };
    const ttl = await this.redis.pttl(input.key);
    return { acquired: false, retryAfterMs: Math.max(1, ttl) };
  }

  async releaseLease(input: { key: string; ownerToken: string }) {
    return (await this.redis.eval<string[], number>(RELEASE_SCRIPT, [input.key], [input.ownerToken])) === 1;
  }
}
