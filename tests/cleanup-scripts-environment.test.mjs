import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("operational cleanup loads .env.local credentials and remains dry-run by default", async () => {
  const result = await runCleanupScript({
    response: [{ completed_credit_count: 1, deleted_deletion_count: 0, expired_deletion_count: 2, missing_disposition_count: 1, released_credit_count: 1, stale_credit_count: 3 }],
    rpc: "cleanup_operational_records",
    script: "cleanup-operational-records.mjs",
  });

  assert.deepEqual(result.requestBody, { p_apply: false, p_batch_limit: 500 });
  assert.deepEqual(result.output, {
    apply: false,
    batch: 500,
    completedCredits: 1,
    deletedDeletionRecords: 0,
    expiredDeletionRecords: 2,
    missingCreditDispositions: 1,
    releasedCredits: 1,
    staleCredits: 3,
  });
});

test("idempotency cleanup loads .env.local credentials and remains dry-run by default", async () => {
  const result = await runCleanupScript({
    response: [{ deleted_count: 0, eligible_count: 4 }],
    rpc: "cleanup_expired_idempotency_operations",
    script: "cleanup-idempotency-operations.mjs",
  });

  assert.deepEqual(result.requestBody, { p_apply: false, p_batch_limit: 500 });
  assert.deepEqual(result.output, { apply: false, batchLimit: 500, deletedCount: 0, eligibleCount: 4 });
});

async function runCleanupScript({ response, rpc, script }) {
  const projectDir = mkdtempSync(join(tmpdir(), "furvise-cleanup-env-"));
  const scriptPath = fileURLToPath(new URL(`../scripts/${script}`, import.meta.url));
  let requestBody;
  let requestUrl;
  const server = createServer((request, serverResponse) => {
    requestUrl = request.url;
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requestBody = JSON.parse(body);
      serverResponse.writeHead(200, { "content-type": "application/json" });
      serverResponse.end(JSON.stringify(response));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const childEnv = { ...process.env };
  for (const name of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NODE_ENV", "__NEXT_PROCESSED_ENV"]) {
    delete childEnv[name];
  }

  try {
    writeFileSync(
      join(projectDir, ".env.local"),
      [`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${address.port}`, "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key"].join("\n"),
      "utf8",
    );
    const childResult = await spawnScript(scriptPath, projectDir, childEnv);
    assert.equal(childResult.code, 0, childResult.stderr);
    assert.equal(requestUrl, `/rest/v1/rpc/${rpc}`);
    return { output: JSON.parse(childResult.stdout), requestBody };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(projectDir, { force: true, recursive: true });
  }

  function spawnScript(path, cwd, env) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path], { cwd, env });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr, stdout }));
    });
  }
}
