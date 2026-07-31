import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("integrity diagnostics load Supabase fallback credentials from .env.local", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "furvise-integrity-env-"));
  const scriptPath = fileURLToPath(new URL("../scripts/run-integrity-diagnostics.mjs", import.meta.url));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify([{ issue_code: "clean", issue_count: 0, severity: "informational" }]));
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
      [
        `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${address.port}`,
        "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key",
      ].join("\n"),
      "utf8",
    );

    const result = await runScript(scriptPath, projectDir, childEnv);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(requests, [{ method: "POST", url: "/rest/v1/rpc/run_furvise_integrity_diagnostics" }]);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.issues, [{ count: 0, issue: "clean", severity: "informational" }]);
    assert.deepEqual(Object.keys(output).sort(), ["checkedAt", "issues"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(projectDir, { force: true, recursive: true });
  }
});

function runScript(scriptPath, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}
