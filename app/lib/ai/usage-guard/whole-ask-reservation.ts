/** Funded six-stage admission on preview and explicitly approved production. */
export const ASK_BUNDLE_SLOTS = 6;
export const ASK_BUNDLE_OUTPUT_CEILING = 8192;
export const RESERVE_WHOLE_ASK_LUA = `
-- One request must have room for all six bounded Mini stages before any paid call.
-- Redis EVAL serializes all tests + reservations atomically. Never reset counters.
local count = tonumber(ARGV[1])
local each = tonumber(ARGV[2])
local calls = tonumber(redis.call('GET', KEYS[1]) or '0')
local spent = tonumber(redis.call('GET', KEYS[2]) or '0')
if count ~= 6 or each < 1 then return {0,calls,spent,9} end
local amount = count * each
local fundedLimit = tonumber(ARGV[9] or '0')
local funded = fundedLimit > 0
if not funded then
 if calls + count > tonumber(ARGV[3]) then return {0,calls,spent,1} end
 if spent + amount > tonumber(ARGV[4]) then return {0,calls,spent,2} end
end
local ledgerKey = funded and KEYS[#KEYS] or KEYS[5]
local ceiling = funded and fundedLimit or tonumber(ARGV[5])
if ceiling <= 0 or redis.call('EXISTS', ledgerKey) ~= 1 then return {0,calls,spent,4} end
local lifetime = tonumber(redis.call('GET', ledgerKey) or '-1')
if lifetime < 0 or lifetime + amount > ceiling then return {0,calls,spent,4} end
local stop = redis.call('GET', KEYS[6])
if stop then
 local ok, data = pcall(cjson.decode, stop)
 if not ok or type(data) ~= 'table' or data.disabled == true then return {0,calls,spent,7} end
end
if tonumber(redis.call('GET', KEYS[4]) or '0') ~= 0 then return {0,calls,spent,6} end
for i=7,#KEYS-1 do
 if redis.call('EXISTS', KEYS[i]) ~= 0 then return {0,calls,spent,6} end
end
redis.call('INCRBY', KEYS[1], count)
redis.call('INCRBY', KEYS[2], amount)
redis.call('INCRBY', KEYS[3], count)
redis.call('INCRBY', KEYS[4], count)
redis.call('INCRBY', ledgerKey, amount)
for _,k in ipairs({1,2,3}) do redis.call('EXPIRE', KEYS[k], tonumber(ARGV[7])) end
redis.call('EXPIRE', KEYS[4], tonumber(ARGV[8]))
for i=7,#KEYS-1 do
 redis.call('HSET', KEYS[i], 'day', ARGV[6], 'cost', each, 'state', 'reserved',
   'feature', 'ask', 'qualification', funded and '0' or '1', 'funded', funded and '1' or '0')
 redis.call('EXPIRE', KEYS[i], tonumber(ARGV[7]))
end
return {1,calls+count,spent+amount,0}
`;
