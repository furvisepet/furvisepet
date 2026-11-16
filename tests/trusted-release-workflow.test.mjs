import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const yaml = createRequire(import.meta.url)("js-yaml");
const source = readFileSync(new URL("../.github/workflows/trusted-release-ci.yml", import.meta.url), "utf8");
const workflow = yaml.load(source);

test("laptop CI accepts only the reviewed owner's release push or pinned dispatch", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ["push", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.push.branches, ["release/journal-first-20261116"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_sha.required, true);
  const guard = workflow.jobs["trusted-release"].if;
  for (const clause of ["github.repository == 'furvisepet/furvisepet'", "github.actor == 'furvisepet'", "github.ref == 'refs/heads/release/journal-first-20261116'"]) assert.ok(guard.includes(clause));
});
test("one bounded job reuses the existing runner without privileges or deployment", () => {
  assert.equal(Object.keys(workflow.jobs).length, 1);
  const job = workflow.jobs["trusted-release"];
  assert.deepEqual(job["runs-on"], ["self-hosted", "Linux", "X64", "furvise-ci"]);
  assert.ok(job["timeout-minutes"] <= 25);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(job.env.OPENAI_API_KEY, "");
  assert.equal(job.env.FURVISE_AI_ENABLED, "false");
  assert.equal(job.env.NODE_OPTIONS, "--max-old-space-size=1536");
  assert.doesNotMatch(source, /secrets\.|pull_request|pull_request_target|docker\s+(?:run|exec|restart)|vercel\s+(?:deploy|promote)|--privileged/);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /@[0-9a-f]{40}$/);
  const checkout = job.steps.find(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  const setup = job.steps.find(step => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(setup.with["node-version"], "24.19.0");
  const first = job.steps[0].run;
  assert.match(first, /furvise-grok-v16-ci/);
  assert.match(first, /3221225472/);
  assert.match(first, /cpu_period \* 2/);
  assert.match(first, /EXPECTED_SHA.*GITHUB_SHA/);
});
