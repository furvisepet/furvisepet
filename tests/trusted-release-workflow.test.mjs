import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const yaml = createRequire(import.meta.url)("js-yaml");
const source = readFileSync(new URL("../.github/workflows/trusted-release-ci.yml", import.meta.url), "utf8");
const workflow = yaml.load(source);
const full = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts.test;

test("hosted release CI stays manual, SHA-pinned and restricted to the reviewed owner", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_sha.required, true);
  const guard = workflow.jobs["trusted-release"].if;
  for (const clause of ["github.repository == 'furvisepet/furvisepet'", "github.actor == 'furvisepet'", "github.ref == 'refs/heads/release/journal-first-20261116'"]) assert.ok(guard.includes(clause));
});
test("release checks use hosted Linux without laptop, privileges or deployment", () => {
  assert.equal(Object.keys(workflow.jobs).length, 1);
  const job = workflow.jobs["trusted-release"];
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.equal(job["timeout-minutes"], "${{ github.event_name == 'workflow_dispatch' && inputs.validation_scope == 'full' && 40 || 5 }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(job.env.OPENAI_API_KEY, "");
  assert.equal(job.env.FURVISE_AI_ENABLED, "false");
  assert.equal(job.env.FURVISE_AI_ASK_ENABLED, "false");
  assert.doesNotMatch(source, /secrets\.|pull_request|self-hosted|furvise-grok|docker\s+(?:run|exec|restart)|vercel\s+(?:deploy|promote)|--privileged/);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[0-9a-f]{40}$/);
  const checkout = job.steps.find(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  assert.match(job.steps[0].run, /EXPECTED_SHA.*GITHUB_SHA/);
});
test("targeted scope cannot masquerade as the full release gate", () => {
  const scope = workflow.on.workflow_dispatch.inputs.validation_scope;
  assert.equal(scope.default, "targeted");
  assert.deepEqual(scope.options, ["targeted", "full"]);
  const steps = workflow.jobs["trusted-release"].steps;
  const subset = steps.find(s => s.name === "Repaired fixture subset (24 tests)");
  assert.match(subset.if, /inputs.validation_scope != 'full'/);
  assert.match(subset.run, /--test-concurrency=1/);
  const fullSteps = steps.slice(steps.findIndex(s => s.id === "locked-dependencies") + 1)
    .filter(s => s !== subset && !s.uses);
  assert.ok(fullSteps.length >= 8);
  for (const step of fullSteps) assert.ok(step.if.includes("inputs.validation_scope == 'full'"), step.name);
});
test("full source qualification retains every discovered test with deadlines and offline transport", () => {
  assert.match(full, /offline-network-guard/);
  assert.match(full, /register-release-typescript/);
  assert.match(full, /--test-concurrency=2/);
  assert.match(full, /--test-timeout=180000/);
  assert.doesNotMatch(full, /--jitless|test-name-pattern|test-skip-pattern|tests\/[^ ]+\.test/);
  const step = workflow.jobs["trusted-release"].steps.find(s => s.name === "Bounded full source suite without provider access");
  assert.match(step.run, /set -euo pipefail/);
  assert.match(step.run, /1200s npm test/);
  assert.match(step.run, /tee ci-evidence\/full-source\.log/);
  const artifact = workflow.jobs["trusted-release"].steps.find(s => s.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(artifact.if, "always()");
  assert.equal(artifact.with.path, "ci-evidence/*.log");
  const ci = yaml.load(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  for (const key of ["verify", "ask-database-contract"]) assert.equal(ci.jobs[key]["runs-on"], "ubuntu-latest");
  assert.ok(ci.jobs.verify.steps.some(s => s.run === "npm test"));
  for (const gate of ["npm run lint", "npm run typecheck", "node scripts/check-security-release.mjs", "npm run test:release", "npm audit --omit=dev --audit-level=high", "npm run build"])
    assert.ok(ci.jobs.verify.steps.some(s => s.run === gate), gate);
});
