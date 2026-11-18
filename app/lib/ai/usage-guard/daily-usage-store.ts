import "server-only";

import { Redis } from "@upstash/redis";
import { getRateLimitBackendConfig } from "../../security/rate-limit/config";
import type { AiGuardStore } from "./types";
import { RESERVE_WHOLE_ASK_LUA } from "./whole-ask-reservation.ts";

const PREFIX = "furvise:ai:v1";

const RESERVE_SCRIPT = `
if redis.call('EXISTS', KEYS[4]) == 1 then
  return {1, 1, tonumber(redis.call('GET', KEYS[1]) or '0'), tonumber(redis.call('GET', KEYS[2]) or '0'), 0}
end
local calls = tonumber(redis.call('GET', KEYS[1]) or '0')
local cost = tonumber(redis.call('GET', KEYS[2]) or '0')
local operationCalls = tonumber(redis.call('GET', KEYS[5]) or '0')
if operationCalls + 1 > tonumber(ARGV[7]) then redis.call('EXPIRE', KEYS[5], ARGV[8]); return {0, 0, calls, cost, 3} end
if calls + 1 > tonumber(ARGV[1]) then return {0, 0, calls, cost, 1} end
if cost + tonumber(ARGV[3]) > tonumber(ARGV[2]) then return {0, 0, calls, cost, 2} end
local qualificationLimit = tonumber(ARGV[9] or '0')
if qualificationLimit > 0 then
  -- Never silently re-initialize a deleted/evicted qualification ledger.
  if redis.call('EXISTS', KEYS[6]) ~= 1 then return {0, 0, calls, cost, 4} end
  local total = tonumber(redis.call('GET', KEYS[6]) or '-1')
  if total < 0 or total + tonumber(ARGV[3]) > qualificationLimit then
    return {0, 0, calls, cost, 4}
  end
end
calls = redis.call('INCR', KEYS[1])
cost = redis.call('INCRBY', KEYS[2], ARGV[3])
if qualificationLimit > 0 then redis.call('INCRBY', KEYS[6], ARGV[3]) end
redis.call('INCR', KEYS[3])
redis.call('INCR', KEYS[5])
redis.call('HSET', KEYS[4], 'day', ARGV[4], 'cost', ARGV[3], 'state', 'reserved', 'feature', ARGV[6], 'qualification', qualificationLimit > 0 and '1' or '0')
for i=1,4 do redis.call('EXPIRE', KEYS[i], ARGV[5]) end
redis.call('EXPIRE', KEYS[5], ARGV[8])
return {1, 0, calls, cost, 0}
`;

const START_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local state = redis.call('HGET', KEYS[1], 'state')
if state == 'reserved' then redis.call('HSET', KEYS[1], 'state', 'started') end
return 1
`;

const RECONCILE_SCRIPT = `
if redis.call('EXISTS', KEYS[3]) == 0 then return {-1, -1} end
local state = redis.call('HGET', KEYS[3], 'state')
if state == 'completed' then return {tonumber(redis.call('GET', KEYS[1]) or '0'), tonumber(redis.call('GET', KEYS[2]) or '0')} end
local reserved = tonumber(redis.call('HGET', KEYS[3], 'cost') or '0')
local actual = tonumber(ARGV[1])
if not actual or actual < 0 then return {-1, -1} end
local qualified = redis.call('HGET', KEYS[3], 'qualification') == '1'
local funded = redis.call('HGET', KEYS[3], 'funded') == '1'
if funded and redis.call('EXISTS', KEYS[6]) ~= 1 then
  redis.call('SET', KEYS[5], '{"disabled":true,"reason":"funded_ledger_missing"}')
  return {-1, -1, 1}
end
if qualified and redis.call('EXISTS', KEYS[4]) ~= 1 then
  redis.call('SET', KEYS[5], '{"disabled":true,"reason":"qualification_ledger_missing"}')
  return {-1, -1, 1}
end
local cost = redis.call('INCRBY', KEYS[2], actual - reserved)
local overshoot = 0
if funded then
  redis.call('INCRBY', KEYS[6], actual - reserved)
  if actual > reserved then
    redis.call('SET', KEYS[5], '{"disabled":true,"reason":"funded_cost_underreserved"}')
    overshoot = 1
  end
end
if qualified then
  redis.call('INCRBY', KEYS[4], actual - reserved)
  if actual > reserved then
    -- Unknown pricing or provider-token discrepancy: preserve actual spend and halt all AI.
    redis.call('SET', KEYS[5], '{"disabled":true,"reason":"qualification_cost_underreserved"}')
    overshoot = 1
  end
end
redis.call('HSET', KEYS[3], 'cost', actual, 'state', 'completed')
return {tonumber(redis.call('GET', KEYS[1]) or '0'), cost, overshoot}
`;

const RELEASE_SCRIPT = `
if redis.call('EXISTS', KEYS[4]) == 0 then return 0 end
if redis.call('HGET', KEYS[4], 'state') ~= 'reserved' then return 0 end
local cost = tonumber(redis.call('HGET', KEYS[4], 'cost') or '0')
redis.call('DECR', KEYS[1]); redis.call('DECRBY', KEYS[2], cost); redis.call('DECR', KEYS[3]); redis.call('DECR', KEYS[5])
if redis.call('HGET', KEYS[4], 'qualification') == '1' then redis.call('DECRBY', KEYS[6], cost) end
if redis.call('HGET', KEYS[4], 'funded') == '1' then redis.call('DECRBY', KEYS[7], cost) end
redis.call('DEL', KEYS[4])
return 1
`;

export class RedisAiGuardStore implements AiGuardStore {
  private readonly redis: Redis;
  constructor(input: { token: string; url: string; timeoutMs: number }) {
    this.redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(input.timeoutMs), token: input.token, url: input.url });
  }
  async emergencyStatus() {
    const value = await this.redis.get<{ disabled?: boolean; reason?: string; updatedAt?: string }>(`${PREFIX}:emergency`);
    return { disabled: value?.disabled === true, reason: typeof value?.reason === "string" ? value.reason : null, updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null };
  }
  async admitOperation(input: { fingerprint: string; key: string; ttlSeconds: number }) {
    const created = await this.redis.set(input.key, `${input.fingerprint}:admitted`, { ex: input.ttlSeconds, nx: true });
    if (created === "OK") return "created" as const;
    const existing = await this.redis.get<string>(input.key);
    if (!existing || !existing.startsWith(`${input.fingerprint}:`)) return "conflict" as const;
    return existing.endsWith(":completed") ? "completed" as const : "reused" as const;
  }
  async completeOperation(input: { key: string; ttlSeconds: number }) { await this.updateOperation(input.key, "completed", input.ttlSeconds); }
  async failOperation(input: { key: string; ttlSeconds: number }) { await this.updateOperation(input.key, "failed", input.ttlSeconds); }
  async reserveCall(input: { callId: string; callLimit: number; costLimitMicrodollars: number; day: string; feature: string; maximumOperationCalls: number; operationCallTtlSeconds: number; operationId: string; reservedCostMicrodollars: number; ttlSeconds: number; qualificationLimitMicrodollars?: number }) {
    const keys = dailyKeys(input.day, input.feature, input.callId, input.operationId);
    const result = await this.redis.eval<string[], number[]>(RESERVE_SCRIPT, keys, [String(input.callLimit), String(input.costLimitMicrodollars), String(input.reservedCostMicrodollars), input.day, String(input.ttlSeconds), input.feature, String(input.maximumOperationCalls), String(input.operationCallTtlSeconds), String(input.qualificationLimitMicrodollars ?? 0)]);
    const snapshot = { calls: Number(result[2]), costMicrodollars: Number(result[3]) };
    if (result[0] === 1) return { allowed: true as const, reused: result[1] === 1, snapshot };
    const reason = result[4] === 1 ? "daily_call_limit" as const
      : result[4] === 2 ? "daily_cost_limit" as const : result[4] === 4 ? "qualification_total_limit" as const : "operation_call_limit" as const;
    return { allowed: false as const, reason, snapshot };
  }
  async reserveWholeAsk(input: {
    callIds: string[]; operationId: string; day: string; ttlSeconds: number; operationTtlSeconds: number;
    callLimit: number; costLimitMicrodollars: number; qualificationLimitMicrodollars: number;
    perCallMicrodollars: number; fundedLimitMicrodollars?: number;
  }) {
    if (input.callIds.length !== 6 || new Set(input.callIds).size !== 6
      || (input.fundedLimitMicrodollars || input.qualificationLimitMicrodollars) <= 0) throw new Error("AI_WHOLE_ASK_INVALID");
    const keys = [
      PREFIX + ":day:" + input.day + ":calls",
      PREFIX + ":day:" + input.day + ":cost",
      PREFIX + ":day:" + input.day + ":feature:ask:calls",
      PREFIX + ":operation:" + input.operationId + ":calls",
      PREFIX + ":qualification:v1-mini-20261117:reserved_total",
      PREFIX + ":emergency",
      ...input.callIds.map(id => PREFIX + ":call:" + id),
      PREFIX + ":funded:v1:reserved_total",
    ];
    const result = await this.redis.eval<string[], number[]>(RESERVE_WHOLE_ASK_LUA, keys, [
      "6", String(input.perCallMicrodollars), String(input.callLimit),
      String(input.costLimitMicrodollars), String(input.qualificationLimitMicrodollars),
      input.day, String(input.ttlSeconds), String(input.operationTtlSeconds),
      String(input.fundedLimitMicrodollars || 0),
    ]);
    const snapshot = { calls: Number(result[1]), costMicrodollars: Number(result[2]) };
    if (result[0] === 1) return { allowed: true as const, snapshot };
    const reason = result[3] === 1 ? "daily_call_limit" as const
      : result[3] === 2 ? "daily_cost_limit" as const
      : result[3] === 4 ? (input.fundedLimitMicrodollars ? "funded_ceiling_reached" as const : "qualification_total_limit" as const)
      : result[3] === 6 ? "operation_conflict" as const
      : result[3] === 7 ? "emergency_disabled" as const : "operation_invalid" as const;
    return { allowed: false as const, reason, snapshot };
  }
  async markCallStarted(input: { callId: string }) {
    const result = await this.redis.eval<string[], number>(START_SCRIPT, [`${PREFIX}:call:${input.callId}`], []);
    if (result !== 1) throw new Error("AI_CALL_RESERVATION_MISSING");
  }
  async reconcileCall(input: { actualCostMicrodollars: number; callId: string }) {
    const reservationKey = `${PREFIX}:call:${input.callId}`;
    const day = await this.redis.hget<string>(reservationKey, "day");
    if (!day) throw new Error("AI_CALL_RESERVATION_MISSING");
    const result = await this.redis.eval<string[], number[]>(RECONCILE_SCRIPT, [`${PREFIX}:day:${day}:calls`, `${PREFIX}:day:${day}:cost`, reservationKey, `${PREFIX}:qualification:v1-mini-20261117:reserved_total`, `${PREFIX}:emergency`, `${PREFIX}:funded:v1:reserved_total`], [String(input.actualCostMicrodollars)]);
    if (result[0] < 0 || result[2] === 1) throw new Error("AI_CALL_RECONCILIATION_FAILED");
    return { calls: Number(result[0]), costMicrodollars: Number(result[1]) };
  }
  async releaseUnstartedCall(input: { callId: string }) {
    const reservationKey = `${PREFIX}:call:${input.callId}`;
    const [day, feature] = await Promise.all([this.redis.hget<string>(reservationKey, "day"), this.redis.hget<string>(reservationKey, "feature")]);
    if (!day || !feature) return;
    const operationId = input.callId.split(":", 1)[0];
    await this.redis.eval<string[], number>(RELEASE_SCRIPT, dailyKeys(day, feature, input.callId, operationId), []);
  }
  private async updateOperation(key: string, state: string, ttlSeconds: number) {
    const existing = await this.redis.get<string>(key); if (!existing) return;
    const fingerprint = existing.split(":", 1)[0]; await this.redis.set(key, `${fingerprint}:${state}`, { ex: ttlSeconds });
  }
}

let store: RedisAiGuardStore | null = null;
let identity = "";
export function getConfiguredAiGuardStore() {
  const config = getRateLimitBackendConfig();
  if (!config.configured) return null;
  const nextIdentity = `${config.url}:${config.token.slice(-8)}:${config.timeoutMs}`;
  if (!store || identity !== nextIdentity) { store = new RedisAiGuardStore(config); identity = nextIdentity; }
  return store;
}

export function utcDay(now = new Date()) { return now.toISOString().slice(0, 10); }
export function secondsUntilUtcBucketExpiry(now = new Date()) {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1_000) + 7_200);
}

function dailyKeys(day: string, feature: string, callId: string, operationId: string) {
  return [`${PREFIX}:day:${day}:calls`, `${PREFIX}:day:${day}:cost`, `${PREFIX}:day:${day}:feature:${feature}:calls`, `${PREFIX}:call:${callId}`, `${PREFIX}:operation:${operationId}:calls`, `${PREFIX}:qualification:v1-mini-20261117:reserved_total`, `${PREFIX}:funded:v1:reserved_total`];
}
