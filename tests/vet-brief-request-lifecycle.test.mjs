import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getOrCreateClientMutationKey, idempotentClientFetch } from "../app/lib/security/idempotency/client.ts";

// Execute the page's request functions with the real idempotency implementation.
// Only authentication, storage and HTTP transport are replaced.
const page = readFileSync(new URL("../app/vet-brief/page.tsx", import.meta.url), "utf8");
const requestFunctions = page.slice(page.indexOf("async function fetchDraft("), page.indexOf("async function getAuthToken("));
const compiled = ts.transpileModule(requestFunctions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("Vet Brief refreshes retire completed keys and preserve only identical pending retries", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } };
  const calls = [];
  let status = 200;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), body.requestId);
    calls.push(body);
    return Response.json(status === 200 ? { document: {}, sourceEntryIds: [] } : { error: "Retry later" }, { status });
  };
  try {
    const context = vm.createContext({ getOrCreateClientMutationKey, idempotentClientFetch, getAuthToken: async () => "test-token" });
    vm.runInContext(compiled, context);
    const generate = (from = "2024-01-01", document) => context.fetchDraft("pet-a", from, "2024-12-31", "", document);
    await generate();
    assert.equal(values.size, 0, "successful initial generation clears its own scope");
    await generate("2024-02-01", { ownerNotes: "Preserve this edit" });
    assert.notEqual(calls[0].requestId, calls[1].requestId);
    assert.equal(values.size, 0);
    status = 503;
    await assert.rejects(generate(), /Retry later/);
    const pending = calls.at(-1).requestId;
    await assert.rejects(generate(), /Retry later/);
    assert.equal(calls.at(-1).requestId, pending, "same ambiguous request keeps its key");
    await assert.rejects(generate("2024-03-01"), /Retry later/);
    assert.notEqual(calls.at(-1).requestId, pending, "changed dates do not reuse a pending request");
    await assert.rejects(generate("2024-01-01", { ownerNotes: "Edited" }), /Retry later/);
    assert.notEqual(calls.at(-1).requestId, pending, "changed owner text is a new request");
    status = 200;
    await generate();
    assert.equal(calls.at(-1).requestId, pending, "original request remains recoverable");
    await generate();
    assert.notEqual(calls.at(-1).requestId, pending, "completed retry is retired");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("confirmed briefs remain addressable and preserve source provenance on reload", () => {
  assert.match(page, /router\.replace\(`\/vet-brief\?\$\{params\.toString\(\)\}`/);
  assert.match(page, /brief: payload\.brief\.id/);
  assert.match(page, /savedDraft\?\.sourceEntryIds \|\| payload\.brief\.sourceEntryIds/);
  const server = readFileSync(new URL("../app/lib/vet-brief/server.ts", import.meta.url), "utf8");
  const functionText = server.slice(server.indexOf("export function toPublicVetBriefRecord"));
  const context = vm.createContext({ parseVetBriefDocument: (value) => value });
  vm.runInContext(ts.transpileModule(functionText.replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const row = { id: "brief-a", pet_profile_id: "pet-a", source_entry_ids: ["source-a"], confirmed_data: { title: "Saved title" } };
  assert.deepEqual(context.toPublicVetBriefRecord(row).sourceEntryIds, ["source-a"]);
  // A retry must carry the same document timestamp; a new clock value changes its fingerprint.
  const confirm = page.slice(page.indexOf("async function confirmBrief"), page.indexOf("function editDocument"));
  assert.match(confirm, /parseVetBriefDocument\(document\)/);
  assert.doesNotMatch(confirm, /new Date\(/);
});

test("generated exports keep their object URL alive until the browser can consume it", async (t) => {
  const { downloadGeneratedFile } = await import("../app/lib/furvise-output.ts");
  const priorWindow = globalThis.window;
  let attached = false;
  let revoked = false;
  let cleanup;
  const link = { click() { assert.equal(attached, true); assert.equal(revoked, false); }, remove() { attached = false; } };
  globalThis.window = {
    document: { createElement: () => link, body: { appendChild: () => { attached = true; } } },
    setTimeout(callback, delay) { assert.ok(delay > 0); cleanup = callback; },
  };
  t.mock.method(URL, "createObjectURL", () => "blob:test-export");
  t.mock.method(URL, "revokeObjectURL", () => { revoked = true; });
  try {
    downloadGeneratedFile(new Blob(["test"]), "brief.pdf");
    assert.equal(link.download, "brief.pdf");
    assert.equal(attached, false);
    assert.equal(revoked, false);
    cleanup();
    assert.equal(revoked, true);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});
