import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, VERCEL_ENV: "production", FURVISE_AI_ENABLED: "false", FURVISE_AI_MEMORY_EXTRACTION_ENABLED: "false", OPENAI_API_KEY: "" },
  stdio: ["ignore", "inherit", "inherit"],
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error("Built server exited before readiness.");
    try {
      const response = await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Bounded startup polling for our own child process. */ }
    await delay(250);
  }
  assert.ok(ready, "Built server must become ready");
  const notes = await fetch(base + "/release-notes", { signal: AbortSignal.timeout(5000) });
  assert.equal(notes.status, 200);
  const html = await notes.text();
  assert.match(html, /No published release updates/);
  assert.doesNotMatch(html, /september-15-2026|2026-09-15|Building Furvise for everyday pet care|Historical public-beta update/);
  assert.doesNotMatch(html, /id="furvise-v1"|Furvise V1 release notes|Your pet(?:&#x27;|')s story, in your own words/);
  assert.match(html, /noindex/);
  const sitemap = await (await fetch(base + "/sitemap.xml", { signal: AbortSignal.timeout(5000) })).text();
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/release-notes<\/loc>/);
  const archived = await fetch(base + "/docs/releases/archive/2026-09-15-public-beta.md", { signal: AbortSignal.timeout(5000) });
  assert.equal(archived.status, 404);
  const availability = await fetch(base + "/api/ai/availability", { signal: AbortSignal.timeout(5000) });
  assert.deepEqual(await availability.json(), { ask: false });
  const blocked = await fetch(base + "/api/ask", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}", signal: AbortSignal.timeout(5000) });
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).code, "AI_FEATURE_UNAVAILABLE");
  console.log("PASS: beta absent, V1 unpublished, sitemap clean, AI disabled; no prompt sent.");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit").then(() => true);
    child.kill();
    if (!await Promise.race([exited, delay(5000).then(() => false)])) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}
