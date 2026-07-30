import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const rootJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = rootJson("package.json");
const lock = rootJson("package-lock.json");

test("framework, CSS, and image dependency remediations stay pinned to reviewed versions", () => {
  assert.equal(packageJson.dependencies.next, "16.2.12");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.2.12");
  assert.equal(packageJson.devDependencies["@tailwindcss/postcss"], "^4.3.3");
  assert.equal(packageJson.devDependencies.tailwindcss, "^4.3.3");
  assert.deepEqual(packageJson.overrides.next, { postcss: "8.5.18", sharp: "0.35.3" });
  assert.equal(lock.packages["node_modules/next"].version, "16.2.12");
  assert.equal(lock.packages["node_modules/next/node_modules/postcss"].version, "8.5.18");
  assert.equal(lock.packages["node_modules/sharp"].version, "0.35.3");
});

test("React stays matched and compatible with the reviewed Next patch", () => {
  assert.equal(packageJson.dependencies.react, "19.2.4");
  assert.equal(packageJson.dependencies["react-dom"], packageJson.dependencies.react);
  assert.equal(lock.packages["node_modules/react"].version, lock.packages["node_modules/react-dom"].version);
  assert.match(lock.packages["node_modules/next"].peerDependencies.react, /19/);
});

test("the lockfile uses npm registry artifacts with integrity and no git or file dependencies", () => {
  assert.equal(lock.lockfileVersion, 3);
  for (const [path, metadata] of Object.entries(lock.packages)) {
    if (!path || !metadata.resolved) continue;
    assert.match(metadata.resolved, /^https:\/\/registry\.npmjs\.org\//, path);
    assert.match(metadata.integrity || "", /^sha512-/, path);
    assert.doesNotMatch(metadata.resolved, /^(?:git|github|file):/i, path);
  }
});

test("Node 24 and npm 11 are the explicit repository runtime policy", () => {
  assert.equal(packageJson.engines.node, ">=24.0.0 <25");
  assert.equal(packageJson.packageManager, "npm@11.18.0");
  assert.equal(source(".nvmrc").trim(), "24");
});

test("patched Sharp native bindings load with the remediated libvips", () => {
  const sharp = require("sharp");
  assert.equal(sharp.versions.sharp, "0.35.3");
  assert.equal(sharp.versions.vips, "8.18.3");
  assert.equal(typeof sharp(Buffer.from("not-an-image")).metadata, "function");
});

test("the patched PostCSS and Tailwind pipeline compiles repository CSS", async () => {
  const postcss = require("postcss");
  assert.equal(postcss().version, "8.5.25");
  const result = await postcss().process(".furvise { color: #123f27 }", { from: undefined });
  assert.match(result.css, /furvise/);
  assert.match(source("postcss.config.mjs"), /@tailwindcss\/postcss/);
  assert.match(source("app/globals.css"), /@import "tailwindcss"/);
});

test("the Next proxy boundary and private cache protections remain explicit after the patch", () => {
  const proxy = source("proxy.ts");
  const privateRoutes = source("app/lib/security/private-routes.ts");
  const config = source("next.config.ts");
  assert.match(proxy, /updateSupabaseSession/);
  assert.match(privateRoutes, /private, no-cache, no-store/);
  assert.doesNotMatch(config, /\bi18n\s*:/);
  assert.match(packageJson.scripts.build, /--webpack/);
  assert.match(packageJson.scripts.dev, /--webpack/);
});

test("image optimization retains local-only defaults and no private-network escape hatch", () => {
  const config = source("next.config.ts");
  assert.doesNotMatch(config, /dangerouslyAllowLocalIP|remotePatterns|domains\s*:/);
  assert.match(source("app/components/brand-mark.tsx"), /from "next\/image"/);
  assert.match(source("app/onboarding/page.tsx"), /from "next\/image"/);
});

test("Dependabot and CI are least-privilege, lockfile-based, and secret-free", () => {
  const dependabot = source(".github/dependabot.yml");
  const ci = source(".github/workflows/ci.yml");
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /interval: weekly/);
  assert.match(ci, /permissions:\s*\n\s*contents: read/);
  assert.match(ci, /npm ci/);
  assert.match(ci, /npm audit --omit=dev --audit-level=high/);
  assert.doesNotMatch(ci, /secrets\.|permissions:\s*write|pull-requests:\s*write|deploy/i);
});

test("environment files remain ignored while the placeholder example stays tracked", () => {
  const ignore = source(".gitignore");
  assert.match(ignore, /\.env\*/);
  assert.match(ignore, /!\.env\.example/);
  const envExample = source(".env.example");
  assert.doesNotMatch(envExample, /(?:sk-proj-|sk-[A-Za-z0-9]{20,}|service_role\s*=\s*eyJ)/);
});
