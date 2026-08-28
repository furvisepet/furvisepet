import "server-only";

export type ProductionConfigResult = { missing: string[]; ready: boolean; warnings: string[] };

export function validateProductionConfiguration(env: Record<string, string | undefined> = process.env): ProductionConfigResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "TURNSTILE_SECRET_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "FURVISE_RATE_LIMIT_HASH_SECRET", "FURVISE_AUTH_RATE_LIMIT_HASH_SECRET", "FURVISE_OPERATIONS_HASH_SECRET", "FURVISE_READINESS_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PLUS_PRICE_ID"]) {
    if (!env[name]?.trim()) missing.push(name);
  }
  if (env.FURVISE_AI_ENABLED !== "false") {
    for (const name of ["OPENAI_API_KEY", "FURVISE_AI_DAILY_CALL_LIMIT", "FURVISE_AI_DAILY_COST_LIMIT_USD"]) if (!env[name]?.trim()) missing.push(name);
  }
  if (!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) warnings.push("TURNSTILE_SITE_KEY_MISSING");
  if (!env.NEXT_PUBLIC_SENTRY_DSN?.trim()) warnings.push("SENTRY_DSN_MISSING");
  if (env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true") warnings.push("GOOGLE_OAUTH_REQUIRES_OPERATOR_VERIFICATION");
  return { missing: [...new Set(missing)].sort(), ready: missing.length === 0, warnings };
}
