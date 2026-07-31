import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("production environment validation loads required values from .env.local", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "furvise-production-env-"));
  const scriptPath = fileURLToPath(new URL("../scripts/validate-production-environment.mjs", import.meta.url));
  const childEnv = { ...process.env };

  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "FURVISE_RATE_LIMIT_HASH_SECRET",
    "FURVISE_AUTH_RATE_LIMIT_HASH_SECRET",
    "FURVISE_OPERATIONS_HASH_SECRET",
    "FURVISE_READINESS_SECRET",
    "OPENAI_API_KEY",
    "FURVISE_AI_DAILY_CALL_LIMIT",
    "FURVISE_AI_DAILY_COST_LIMIT_USD",
    "NODE_ENV",
  ]) {
    delete childEnv[name];
  }

  try {
    writeFileSync(
      join(projectDir, ".env.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key",
        "SUPABASE_SECRET_KEY=test-service-key",
        "UPSTASH_REDIS_REST_URL=https://example.upstash.io",
        "UPSTASH_REDIS_REST_TOKEN=test-redis-token",
        "FURVISE_RATE_LIMIT_HASH_SECRET=test-rate-limit-hash-secret",
        "FURVISE_AUTH_RATE_LIMIT_HASH_SECRET=test-auth-rate-hash-secret",
        "FURVISE_OPERATIONS_HASH_SECRET=test-operations-hash-secret",
        "FURVISE_READINESS_SECRET=test-readiness-secret",
        "FURVISE_AI_ENABLED=false",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: projectDir,
      encoding: "utf8",
      env: childEnv,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { missing: [], ready: true });
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});
