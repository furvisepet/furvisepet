/** Preview-only whole-Ask prepayment. Production policy remains unchanged. */
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
if calls + count > tonumber(ARGV[3]) then return {0,calls,spent,1} end
if spent + amount > tonumber(ARGV[4]) then return {0,calls,spent,2} end
if redis.call('EXISTS', KEYS[5]) ~= 1 then return {0,calls,spent,4} end
local lifetime = tonumber(redis.call('GET', KEYS[5]) or '-1')
if lifetime < 0 or lifetime + amount > tonumber(ARGV[5]) then return {0,calls,spent,4} end
local stop = redis.call('GET', KEYS[6])
if stop then
 local ok, data = pcall(cjson.decode, stop)
 if not ok or type(data) ~= 'table' or data.disabled == true then return {0,calls,spent,7} end
end
if tonumber(redis.call('GET', KEYS[4]) or '0') ~= 0 then return {0,calls,spent,6} end
for i=7,#KEYS do
 if redis.call('EXISTS', KEYS[i]) ~= 0 then return {0,calls,spent,6} end
end
redis.call('INCRBY', KEYS[1], count)
redis.call('INCRBY', KEYS[2], amount)
redis.call('INCRBY', KEYS[3], count)
redis.call('INCRBY', KEYS[4], count)
redis.call('INCRBY', KEYS[5], amount)
for _,k in ipairs({1,2,3}) do redis.call('EXPIRE', KEYS[k], tonumber(ARGV[7])) end
redis.call('EXPIRE', KEYS[4], tonumber(ARGV[8]))
for i=7,#KEYS do
 redis.call('HSET', KEYS[i], 'day', ARGV[6], 'cost', each, 'state', 'reserved',
   'feature', 'ask', 'qualification', '1')
 redis.call('EXPIRE', KEYS[i], tonumber(ARGV[7]))
end
return {1,calls+count,spent+amount,0}
`;
