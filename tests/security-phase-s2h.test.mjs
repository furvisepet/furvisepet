import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allowlistedMetadata, safeOperationalIdentifier } from "../app/lib/operations/events/redaction.ts";
import { buildSupportReference } from "../app/lib/operations/support-reference.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260730030000_add_operational_readiness.sql");
const writeBarrier = source("supabase/migrations/20260730031000_block_writes_for_deleting_accounts.sql");
const expandedIntegrity = source("supabase/migrations/20260730032000_expand_operational_integrity_checks.sql");
const deletion = source("app/api/account/delete/route.ts");
const exportRoute = source("app/api/account/export/route.ts");

test("operational metadata is explicitly allowlisted and secret-like fields are dropped", () => {
  assert.deepEqual(allowlistedMetadata({ count: 2, email: "owner@example.test", password: "secret", status: "ok", token: "x" }), { count: 2, status: "ok" });
  process.env.FURVISE_OPERATIONS_HASH_SECRET = "operations-test-secret-at-least-32-characters";
  assert.notEqual(safeOperationalIdentifier("owner@example.test"), "owner@example.test");
});

test("event adapter failures cannot crash requests and critical events use the interface", () => {
  const logger = source("app/lib/operations/events/logger.ts"); const metrics = source("app/lib/operations/events/metrics.ts");
  assert.match(logger, /Promise\.resolve\(adapter\.emit\(event\)\)\.catch/); assert.match(logger, /catch \{ \/\* Observability never breaks/);
  assert.match(metrics, /OperationalMetrics/); assert.match(logger, /metrics\.record\(\{ eventType: input\.eventType, severity: input\.severity \}\)/); assert.match(logger, /severity === "critical"/);
});

test("safe support references contain no actor, email, narrative, or stack", () => {
  const value = buildSupportReference({ code: "BAD\nCODE", operationId: "op-1", requestId: "req-1" });
  assert.deepEqual(Object.keys(value).sort(), ["code", "operationId", "requestId", "timestamp"]);
  assert.equal(value.code, "BADCODE");
});

test("public health is shallow and reveals no dependency details", () => {
  const health = source("app/api/health/route.ts"); assert.match(health, /\{ status: "ok" \}/);
  assert.doesNotMatch(health, /supabase|redis|openai|version|environment/i); assert.match(health, /no-store/);
});

test("readiness requires a timing-safe operator secret and returns only safe component states", () => {
  const readiness = source("app/api/readiness/route.ts");
  assert.match(readiness, /x-furvise-operator-key/); assert.match(readiness, /timingSafeEqual/); assert.match(readiness, /status: 404/);
  assert.match(readiness, /"ready" \| "unavailable" \| "misconfigured"/); assert.doesNotMatch(readiness, /OPENAI_API_KEY.*Response|UPSTASH_REDIS_REST_URL.*Response/);
});

test("readiness uses bounded timeouts and never calls OpenAI", () => {
  const readiness = source("app/api/readiness/route.ts"); assert.match(readiness, /AbortSignal\.timeout\(1_000\)/); assert.match(readiness, /AbortSignal\.timeout\(800\)/);
  assert.doesNotMatch(readiness, /openai|responses\.create|chat\.completions/i);
});

test("account deletion authenticates, validates origin, requires current-session recent auth and exact confirmation", () => {
  assert.match(deletion, /getAuthenticatedApiContext/); assert.match(source("app/lib/authenticated-api-server.ts"), /validateSensitiveRequestOriginResponse/);
  assert.match(deletion, /requireRecentInteractiveAuthentication\(context\)/); assert.doesNotMatch(deletion, /hasRecentAuthentication|last_sign_in_at/);
  assert.ok(deletion.indexOf("requireRecentInteractiveAuthentication(context)") < deletion.indexOf("const rate = await beginRateLimitedRequest"));
  assert.ok(deletion.indexOf("requireRecentInteractiveAuthentication(context)") < deletion.indexOf("prepare_account_deletion"));
  assert.match(deletion, /confirmation !== "DELETE"/); assert.doesNotMatch(deletion, /p_user_id:\s*(?:body|input)/);
});

test("account deletion requires canonical idempotency and destructive distributed limits", () => {
  assert.match(deletion, /resolveIdempotencyKey/); assert.match(deletion, /policy: "DESTRUCTIVE_WRITE"/); assert.match(migration, /unique \(user_id, idempotency_key\)/);
  assert.match(migration, /payload_hash <> p_payload_hash/); assert.match(migration, /return query select 'replay'/);
});

test("application deletion is transactional and Auth deletion follows it", () => {
  assert.match(migration, /^begin;/); assert.match(migration, /commit;$/m);
  assert.ok(deletion.indexOf("prepare_account_deletion") < deletion.indexOf("deleteUser"));
  for (const table of ["ai_update_suggestions", "ask_conversation_messages", "vet_visit_briefs", "furvise_memories", "pet_current_state", "pet_care_entries", "pet_care_episodes", "pet_concerns", "dog_profiles", "ai_usage_events", "user_profiles"]) assert.match(migration, new RegExp(`delete from public\\.${table}`));
});

test("partial Auth deletion creates reconciliation state and disables the identity", () => {
  assert.match(migration, /auth_delete_failed/); assert.match(deletion, /mark_account_deletion_result/); assert.match(deletion, /ban_duration/);
  assert.match(deletion, /ACCOUNT_DELETION_RECONCILIATION_REQUIRED/); assert.match(deletion, /account_deletion_failed/);
  assert.match(writeBarrier, /ACCOUNT_DELETION_PENDING/); assert.match(writeBarrier, /idempotency_operations/); assert.match(writeBarrier, /ai_usage_events/);
});

test("account deletion never uses GET and private responses do not cache", () => {
  assert.doesNotMatch(deletion, /export (?:async )?function GET/); assert.match(deletion, /private, no-store/);
});

test("export authenticates, requires current-session recent auth, origin protection, idempotency and bounded rate policy", () => {
  assert.match(exportRoute, /getAuthenticatedApiContext/); assert.match(exportRoute, /requireRecentInteractiveAuthentication\(context\)/);
  assert.doesNotMatch(exportRoute, /hasRecentAuthentication|last_sign_in_at/);
  assert.ok(exportRoute.indexOf("requireRecentInteractiveAuthentication(context)") < exportRoute.indexOf("const gate = await beginIdempotentRateLimitedOperation"));
  assert.ok(exportRoute.indexOf("requireRecentInteractiveAuthentication(context)") < exportRoute.indexOf("const body = await buildUserDataExport"));
  assert.match(exportRoute, /beginIdempotentRateLimitedOperation/);
  assert.match(exportRoute, /policy: "DATA_EXPORT"/); assert.match(source("app/lib/security/rate-limit/config.ts"), /DATA_EXPORT:[\s\S]*limit: 3, windowMs: HOUR/);
});

test("export is owner-filtered, bounded, private, attached, and strips internal fields", () => {
  const exporter = source("app/lib/operations/user-data-export.ts"); assert.match(exporter, /\.eq\("user_id", user\.id\)/); assert.match(exporter, /EXPORT_ROW_LIMIT = 5_000/);
  assert.match(exporter, /MAX_EXPORT_BYTES = 96 \* 1024/); assert.match(exportRoute, /Content-Disposition/); assert.match(exportRoute, /private, no-store/);
  for (const value of ["context_used", "idempotency_key", "payload_hash", "provider_response", "source_excerpt"]) assert.match(exporter, new RegExp(`"${value}"`));
});

test("export includes the documented user categories and excludes operational stores", () => {
  const exporter = source("app/lib/operations/user-data-export.ts");
  for (const table of ["dog_profiles", "pet_care_entries", "pet_care_episodes", "pet_current_state", "pet_concerns", "furvise_memories", "ask_conversations", "ask_conversation_messages", "dog_product_feedback", "vet_visit_briefs", "ai_usage_events"]) assert.match(exporter, new RegExp(`"${table}"`));
  assert.doesNotMatch(exporter, /idempotency_operations|account_deletion_requests|redis/i);
});

test("operational cleanup defaults dry-run, requires apply confirmation and bounds batches", () => {
  const cleanup = source("scripts/cleanup-operational-records.mjs"); assert.match(cleanup, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(cleanup, /--confirm-apply/); assert.match(cleanup, /batch < 1 \|\| batch > 5000/); assert.match(cleanup, /process\.exit\(code\)/);
  assert.match(migration, /for update skip locked/); assert.match(migration, /status = 'reserved'.*30 minutes/s);
});

test("cleanup and diagnostics are service-only", () => {
  for (const fn of ["cleanup_operational_records", "run_furvise_integrity_diagnostics", "furvise_readiness_snapshot"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[^;]+ from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[^;]+ to service_role`));
  }
});

test("integrity diagnostics cover orphan, memory, credit, idempotency and deletion failures with counts only", () => {
  const script = source("scripts/run-integrity-diagnostics.mjs");
  const checks = migration + expandedIntegrity;
  for (const issue of ["pets_without_auth_owner", "care_without_pet", "duplicate_active_memory", "duplicate_active_medication_state", "stale_ai_credit_reservation", "stale_idempotency_processing", "provider_usage_reconciliation_required", "account_deletion_reconciliation", "migration_version_mismatch"]) assert.match(checks, new RegExp(issue));
  assert.match(script, /issue_count/); assert.doesNotMatch(script, /select\("\*"\)|email|note|narrative/i); assert.match(script, /process\.exitCode = 1/);
});

test("production validation fails required configuration while AI-disabled mode omits OpenAI", () => {
  const config = source("app/lib/operations/production-config.ts"); const script = source("scripts/validate-production-environment.mjs");
  for (const name of ["SUPABASE_SECRET_KEY", "UPSTASH_REDIS_REST_TOKEN", "FURVISE_AUTH_RATE_LIMIT_HASH_SECRET", "FURVISE_READINESS_SECRET"]) assert.match(config, new RegExp(name));
  assert.match(config, /FURVISE_AI_ENABLED !== "false"/); assert.match(script, /process\.exitCode = 1/);
});

test("client bundle receives no new server operational credentials", () => {
  const client = source("app/account/page.tsx"); assert.doesNotMatch(client, /SUPABASE_SECRET_KEY|FURVISE_READINESS_SECRET|FURVISE_OPERATIONS_HASH_SECRET|UPSTASH_REDIS_REST_TOKEN/);
  assert.match(source(".env.example"), /FURVISE_OPERATIONS_HASH_SECRET/); assert.match(source(".env.example"), /FURVISE_READINESS_SECRET/);
});

test("operator documentation distinguishes preparation from active external services", () => {
  for (const path of ["docs/production-operations.md", "docs/monitoring-and-alerting.md", "docs/backup-and-restore.md", "docs/scheduled-maintenance.md", "docs/production-operator-checklist.md"]) {
    assert.match(source(path), /not (?:configured|verified|active)|unverified|No [^.]*?(?:active|configured|verified)/i, path);
  }
});

test("deployment and incident runbooks avoid destructive database rollback guidance", () => {
  const deploy = source("docs/deployment-and-rollback.md"); const incident = source("docs/incident-response.md");
  assert.match(deploy, /Never blindly reverse a database/); assert.match(deploy, /forward repair/); assert.match(incident, /SEV-1/); assert.doesNotMatch(incident, /Do not promise statutory notification/);
});
