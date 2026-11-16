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
  assert.equal(job["timeout-minutes"], "${{ github.event_name == 'workflow_dispatch' && inputs.validation_scope == 'full' && 25 || 3 }}");
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

test("push defaults to the bounded subset and never starts a full check", () => {
  const scope=workflow.on.workflow_dispatch.inputs.validation_scope;
  assert.equal(scope.required,true);
  assert.equal(scope.default,"targeted");
  assert.deepEqual(scope.options,["targeted","full"]);
  const job=workflow.jobs["trusted-release"];
  assert.equal(job.name,"${{ github.event_name == 'workflow_dispatch' && inputs.validation_scope == 'full' && 'Trusted release checks (full)' || 'Targeted release checks' }}");
  const steps=job.steps;
  const subset=steps.find(s=>s.name==="Repaired fixture subset (24 tests)");
  assert.equal(subset.if,"${{ github.event_name != 'workflow_dispatch' || inputs.validation_scope != 'full' }}");
  assert.equal(subset["timeout-minutes"],2);
  assert.equal(subset.env.NODE_OPTIONS,"--max-old-space-size=384");
  assert.match(subset.run,/90s taskset/);
  assert.match(subset.run,/--test-concurrency=1/);
  for(const file of ["care-log","care-update-intent-lifecycle","care-workspace-stale-callback","ask-availability-route-fixture"]) assert.ok(subset.run.includes("tests/"+file+".test.mjs"));
  assert.doesNotMatch(subset.run,/npm test|npm run build|--full-schema/);
  const fullSteps=steps.slice(steps.findIndex(s=>s.id==="locked-dependencies")+1).filter(s=>s!==subset);
  assert.ok(fullSteps.length>=8);
  for(const step of fullSteps) assert.ok(step.if.includes("github.event_name == 'workflow_dispatch' && inputs.validation_scope == 'full'"),step.name);
});
