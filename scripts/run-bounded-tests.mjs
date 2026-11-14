import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

const repo = process.cwd();
const files = [];
function visit(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile() && /\.test\.(?:mjs|js|cjs|ts)$/.test(entry.name))
      files.push(path.replaceAll("\\", "/"));
  }
}
for (const dir of ["test", "tests"]) visit(dir);
files.sort((a, b) => Number(/(?:ask-active-contract|integration|end-to-end)/.test(a)) - Number(/(?:ask-active-contract|integration|end-to-end)/.test(b)) || a.localeCompare(b));
if (files.length < 500) throw Error("Expected at least 500 Furvise test files; found " + files.length);

const cache = new Map();
function usesFullAlgebraFixture(path, seen = new Set()) {
  const absolute = resolve(repo, path);
  if (!absolute.startsWith(repo + sep) || !existsSync(absolute) || seen.has(absolute)) return false;
  if (/(?:^|[/\\])(?:calculation-fixture|canonical-calculation-retirement|calculation-engine-policy)\.mjs$/.test(absolute)) return true;
  const cached = cache.get(absolute);
  if (cached !== undefined) return cached;
  seen.add(absolute);
  const source = readFileSync(absolute, "utf8");
  // Acceptance wrappers execute secondary audit files via literal paths.
  // Their child process needs the same test-only algebra context.
  for (const match of source.matchAll(/["'](scripts\/audits\/[^"']+\.mjs)["']/g)) {
    if (usesFullAlgebraFixture(match[1], seen)) {
      cache.set(absolute, true);
      return true;
    }
  }
  const imports = [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+\.mjs)["']/g)];
  for (const match of imports) {
    const target = resolve(dirname(absolute), match[1]);
    if (usesFullAlgebraFixture(relative(repo, target), seen)) {
      cache.set(absolute, true);
      return true;
    }
  }
  cache.set(absolute, false);
  return false;
}
const algebra = new Set(files.filter(file => usesFullAlgebraFixture(file)));
console.log("FURVISE_TEST_INVENTORY files=" + files.length + " fullAlgebra=" + algebra.size + " nativeProduct=" + (files.length-algebra.size));
if (process.argv.includes("--list")) {
  console.log("LIST_ONLY_NOT_A_QUALIFICATION");
  for (const file of algebra) console.log("ALGEBRA_FIXTURE " + file);
  process.exit(0);
}
if (process.argv.length !== 2) throw Error("Unexpected arguments: the release gate must execute every test");

const failures = [];
const maxFailures = 20;
const baseFlags = ["--experimental-transform-types", "--import", "./tests/register-typescript-imports.mjs"];

function discoverCases(file, env) {
  if (file !== "tests/ask-interpretation-input-budget.test.mjs") return [null];
  // This source has one eight-case matrix and nine independent named tests.
  // Fail closed on changed declarations, so no test is silently excluded.
  const source = readFileSync(resolve(repo, file), "utf8");
  const matrix = "for(const numeric of [false,true])for(const count of [0,2,8,39])";
  const prefix = 'test("final request: five pets, 1200 exact characters, "+count+" prior turns, numeric="+numeric';
  if (!source.includes(matrix) || !source.includes(prefix))
    throw Error("INPUT_BUDGET_MATRIX_CHANGED");
  const staticNames = [...source.matchAll(/(?:^|\n)\s*test\("([^"]+)"\s*,/g)].map(m => m[1]);
  if (staticNames.length !== 9 || new Set(staticNames).size !== 9)
    throw Error("INPUT_BUDGET_NAMED_TESTS_CHANGED " + staticNames.length);
  const matrixNames = [false, true].flatMap(numeric =>
    [0,2,8,39].map(count =>
      "final request: five pets, 1200 exact characters, " + count + " prior turns, numeric=" + numeric));
  const names = [...matrixNames, ...staticNames];
  if (names.length !== 17 || new Set(names).size !== names.length)
    throw Error("INPUT_BUDGET_TEST_COUNT_CHANGED " + names.length);
  console.log("INPUT_BUDGET_ISOLATION_CASES=" + names.length);
  return names;
}
const regexEscape = value => value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
let visited = 0;
async function runOne(file, index) {
  const flags = [...baseFlags];
  if (algebra.has(file)) flags.push("--import", "./tests/helpers/calculation-engine-policy.mjs");
  const envFlags = [
    "--max-old-space-size=768", "--experimental-transform-types",
    "--import", resolve(repo, "tests/register-typescript-imports.mjs"),
  ];
  if (algebra.has(file)) envFlags.push("--import", resolve(repo, "tests/helpers/calculation-engine-policy.mjs"));
  const childEnv = { ...process.env, NODE_OPTIONS: envFlags.join(" ") };
  const caseNames = discoverCases(file, childEnv);
  let filePassed = true;
  for (const [caseIndex, testName] of caseNames.entries()) {
    const args = [...flags, "--test", "--test-concurrency=1"];
    if (testName) args.push("--test-name-pattern=^" + regexEscape(testName) + "$");
    args.push(file);
    const seconds = testName ? 150 : /(?:ask-active-contract|integration|end-to-end|ask-interpretation-input-budget)/.test(file) ? 420 : 150;
    const launcher = process.platform === "win32" ? process.execPath : "timeout";
    const launchArgs = process.platform === "win32"
      ? args : ["-k", "5s", String(seconds)+"s", process.execPath, ...args];
    let output = "";
    const started = performance.now();
    const context = testName ? (" case=" + (caseIndex+1) + "/" + caseNames.length + " " + testName) : "";
    console.log("START " + (index+1) + "/" + files.length + " " + file + context + " timeout=" + seconds + "s");
    const passed = await new Promise(resolvePromise => {
      let settled = false;
      const child = spawn(launcher, launchArgs, {
        cwd: repo, env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      const capture = chunk => {
        output += chunk.toString("utf8");
        if (output.length > 120000) output = output.slice(-120000);
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      const heartbeat = setInterval(() => {
        console.log("STILL_RUNNING " + file + context + " seconds=" + Math.round((performance.now()-started)/1000));
      }, 20000);
      const windowsTimeout = process.platform === "win32"
        ? setTimeout(() => child.kill("SIGKILL"), seconds*1000) : null;
      function finish(code, signal, error) {
        if (settled) return;
        settled = true;
        clearInterval(heartbeat);
        if (windowsTimeout) clearTimeout(windowsTimeout);
        const duration = Math.round((performance.now()-started)/1000);
        const ok = code === 0 && !error;
        console.log((ok ? "PASS " : "FAIL ") + (index+1) + "/" + files.length + " seconds=" + duration + " status=" + code + " " + file + context);
        if (!ok) {
          failures.push({file, testName, code, signal, error:error?.message||null});
          console.log("FAILURE_DETAIL " + file + context + "\n" + output.slice(-9000));
        }
        resolvePromise(ok);
      }
      child.on("error", error => finish(null, null, error));
      child.on("close", (code, signal) => finish(code, signal));
    });
    if (!passed) filePassed = false;
    if (failures.length >= maxFailures) break;
  }
  return filePassed;
}
for (let i=0; i<files.length; i++) {
  await runOne(files[i], i);
  visited++;
  if (failures.length >= maxFailures) {
    console.log("STOPPED_AFTER_" + maxFailures + "_FAILURES filesVisited=" + visited);
    break;
  }
}
console.log("FURVISE_FULL_SUITE_RESULT " + JSON.stringify({
  discoveredFiles:files.length, visited, complete:visited===files.length,
  failures, passed:visited===files.length && failures.length===0
}));
if (visited !== files.length || failures.length) process.exitCode=1;
else console.log("ALL_FURVISE_TEST_FILES_PASSED");