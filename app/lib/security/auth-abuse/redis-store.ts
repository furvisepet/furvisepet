import "server-only";

import { Redis } from "@upstash/redis";
import type { AuthAbuseStore } from "./types";

const CHECK = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = tonumber(ARGV[2])
  if oldest[2] then retry = math.max(1, tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1])) end
  return {0, count, retry}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) + 1000)
return {1, count + 1, 0}
`;
const STATE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count == 0 then return {0, 0} end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
return {count, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1]))}
`;
const CLAIM = `
local existing = redis.call('GET', KEYS[1])
if existing then
  if existing == ARGV[1] then return 2 end
  return 3
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
return 1
`;

export class RedisAuthAbuseStore implements AuthAbuseStore {
  private readonly redis: Redis;
  constructor(input: { timeoutMs: number; token: string; url: string }) {
    this.redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(input.timeoutMs), token: input.token, url: input.url });
  }
  async check(input: { key: string; limit: number; member: string; nowMs: number; windowMs: number }) {
    const result = await this.redis.eval<string[], number[]>(CHECK, [input.key], [String(input.nowMs), String(input.windowMs), String(input.limit), input.member]);
    return { allowed: result[0] === 1, count: Number(result[1] || 0), retryAfterMs: Number(result[2] || 0) };
  }
  async claim(input: { fingerprint: string; key: string; ttlMs: number }) {
    const result = await this.redis.eval<string[], number>(CLAIM, [input.key], [input.fingerprint, String(input.ttlMs)]);
    return result === 1 ? "new" as const : result === 2 ? "replay" as const : "conflict" as const;
  }
  async clear(key: string) { await this.redis.del(key); }
  async state(input: { key: string; nowMs: number; windowMs: number }) {
    const result = await this.redis.eval<string[], number[]>(STATE, [input.key], [String(input.nowMs), String(input.windowMs)]);
    return { count: Number(result[0] || 0), retryAfterMs: Number(result[1] || 0) };
  }
}
