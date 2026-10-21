export const RESERVATION_INDEX_LUA = "\n-- Observational locator only. Original accounting above is authoritative.\n-- Failures/caps never alter the original guard result; coverage stays partial.\nif ARGV[9] ~= '' and ARGV[10] ~= '' and KEYS[6] then\n  local function ok(value) return not (type(value) == 'table' and value.err) end\n  local marked = redis.pcall('HSET', KEYS[4], 'ownerScope', ARGV[9], 'requestId', ARGV[10], 'ownerIndexStatus', 'unavailable')\n  if ok(marked) then\n    local clock = redis.pcall('TIME')\n    local ttl = redis.pcall('PTTL', KEYS[4])\n    local keyType = redis.pcall('TYPE', KEYS[6])\n    if type(keyType) == 'table' and not keyType.err then keyType = keyType.ok end\n    if type(clock) == 'table' and not clock.err and tonumber(clock[1]) and tonumber(clock[2])\n      and type(ttl) == 'number' and ttl > 0 and (keyType == 'none' or keyType == 'zset') then\n      local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)\n      local pruned = redis.pcall('ZREMRANGEBYSCORE', KEYS[6], '-inf', now)\n      local count = redis.pcall('ZCARD', KEYS[6])\n      if ok(pruned) and type(count) == 'number' and count < 1024 then\n        local added = redis.pcall('ZADD', KEYS[6], now + ttl, ARGV[11])\n        if ok(added) then\n          local remaining = redis.pcall('PTTL', KEYS[6])\n          local expirySet = type(remaining) == 'number' and redis.pcall('PEXPIRE', KEYS[6], math.max(remaining, ttl))\n          if expirySet and ok(expirySet) then redis.pcall('HSET', KEYS[4], 'ownerIndexStatus', 'indexed', 'ownerIndexedAt', now) end\n        end\n      end\n    end\n  end\nend\n";
export const READ_OWNER_RESERVATIONS_LUA = "\nlocal clock = redis.call('TIME')\nlocal now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)\nlocal kind = redis.call('TYPE', KEYS[1])\nif type(kind) == 'table' then kind = kind.ok end\nif kind == 'none' then return {'missing_index', now, 0, {}} end\nif kind ~= 'zset' then return {'index_wrong_type', now, 0, {}} end\nlocal count = redis.call('ZCARD', KEYS[1])\nlocal ids = redis.call('ZREVRANGE', KEYS[1], 0, tonumber(ARGV[2]) - 1)\nlocal rows = {}\nfor _, id in ipairs(ids) do\n  local key = ARGV[3] .. id\n  local values = redis.call('HMGET', key, 'ownerScope', 'requestId', 'state', 'cost', 'feature', 'ownerIndexStatus', 'ownerIndexedAt')\n  local ttl = redis.call('PTTL', key)\n  if not values[1] then\n    table.insert(rows, {'missing_released_or_expired'})\n  elseif values[1] ~= ARGV[1] then\n    table.insert(rows, {'binding_mismatch'})\n  elseif ttl <= 0 then\n    table.insert(rows, {'invalid_or_expired_ttl'})\n  else\n    table.insert(rows, {'bound', id, values[2] or '', values[3] or '', values[4] or '', values[5] or '', ttl, values[6] or '', values[7] or ''})\n  end\nend\nreturn {'partial', now, count, rows}\n";
export const OWNER_INDEX_CAP = 1024;
export const OWNER_READ_LIMIT = 50;
export type OwnerCallObservation = { ownerScope: string; requestId: string };
export const validOwnerScope = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const validObservationRequest = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
export type ObservedHeldCall = { callId: string; requestId: string; state: "reserved" | "started"; feature: string; costMicrodollars: number; expiresAt: string; indexedAt: string | null };
export function unavailableOwnerReservations(status = "backend_unavailable", now = new Date()) {
  return {
    backingStore: "Redis_AI_guard" as const, scope: "authenticated_owner_indexed_calls" as const,
    status, receivedAt: now.toISOString(), observedAt: null as string | null,
    complete: false as const, allClear: null, coverageStart: null, expiresAt: null,
    coverage: "new_indexed_reservations_only_pre_index_and_missed_observations_unknown" as const,
    indexCount: null as number | null, sampledCount: 0, readLimit: OWNER_READ_LIMIT, indexCap: OWNER_INDEX_CAP,
    truncated: null as boolean | null, stale: null as boolean | null,
    activeHolds: null as ObservedHeldCall[] | null, completedObservations: 0, unknownObservations: 0,
    reason: "A bounded locator is not retroactive or exhaustive. SQL pending usage and historical uncertainty remain separate.",
  };
}
export type OwnerReservationSnapshot = ReturnType<typeof unavailableOwnerReservations>;
/** No hash state, TTL or inventory is modified by normalization or reading. */
export function normalizeOwnerReservations(raw: unknown, limit: number, now = new Date()): OwnerReservationSnapshot {
  const base = unavailableOwnerReservations("invalid_backend_observation", now);
  if (!Array.isArray(raw) || raw.length !== 4 || !Array.isArray(raw[3])
    || !Number.isSafeInteger(Number(raw[1])) || Number(raw[1]) <= 0
    || !Number.isFinite(new Date(Number(raw[1])).getTime())
    || !Number.isSafeInteger(Number(raw[2])) || Number(raw[2]) < 0 || raw[3].length > limit) return base;
  if (!["partial","missing_index","index_wrong_type"].includes(raw[0])) return base;
  base.observedAt = new Date(Number(raw[1])).toISOString();
  base.stale = Math.abs(now.getTime() - Number(raw[1])) > 5000;
  base.status = raw[0]; base.readLimit = limit;
  if (raw[0] !== "partial") return base;
  base.indexCount = Number(raw[2]); base.sampledCount = raw[3].length;
  base.truncated = base.indexCount > raw[3].length; base.activeHolds = [];
  for (const row of raw[3]) {
    if (!Array.isArray(row) || row[0] !== "bound" || row.length !== 9
      || typeof row[1] !== "string" || !/^[a-f0-9]{64}:[a-f0-9-]{36}$/.test(row[1])
      || !validObservationRequest(row[2]) || !["reserved","started","completed"].includes(row[3])
      || !Number.isSafeInteger(Number(row[4])) || Number(row[4]) < 0
      || typeof row[5] !== "string" || !/^[a-z_]{1,40}$/.test(row[5])
      || !Number.isSafeInteger(Number(row[6])) || Number(row[6]) <= 0
      || !Number.isFinite(new Date(Number(raw[1]) + Number(row[6])).getTime())
      || row[7] !== "indexed" || !Number.isSafeInteger(Number(row[8])) || Number(row[8]) <= 0 || !Number.isFinite(new Date(Number(row[8])).getTime())) {
      base.unknownObservations++; continue;
    }
    if (row[3] === "completed") { base.completedObservations++; continue; }
    base.activeHolds.push({ callId: row[1], requestId: row[2], state: row[3], feature: row[5],
      costMicrodollars: Number(row[4]), expiresAt: new Date(Number(raw[1]) + Number(row[6])).toISOString(),
      indexedAt: new Date(Number(row[8])).toISOString() });
  }
  return base;
}
