import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "FURVISE_RATE_LIMIT_HASH_SECRET", "FURVISE_AUTH_RATE_LIMIT_HASH_SECRET", "FURVISE_OPERATIONS_HASH_SECRET", "FURVISE_READINESS_SECRET"];
if (process.env.FURVISE_AI_ENABLED !== "false") required.push("OPENAI_API_KEY", "FURVISE_AI_DAILY_CALL_LIMIT", "FURVISE_AI_DAILY_COST_LIMIT_USD");
const missing = required.filter((name) => !process.env[name]?.trim());
console.log(JSON.stringify({ missing, ready: missing.length === 0 }));
if (missing.length) process.exitCode = 1;
