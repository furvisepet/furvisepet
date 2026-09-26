import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ask = read("app/ask/page.tsx");
const css = read("app/globals.css");

test("Ask uses the approved human new-question copy with dynamic pet context", () => {
  assert.match(ask, /title="Ask Furvise"/);
  assert.match(ask, /<details className="ask-example-questions"><summary>Example questions/);
  assert.match(ask, /Ask about \$\{petName\}/);
  assert.doesNotMatch(ask, /noteMode|Save note to care history/);
  assert.doesNotMatch(ask, /Asking about|Ask about changes, routines, products|What's up with \$\{petName\}\?|Ask anything about \$\{petName\}/);
});

test("Ask visible actions and conversation empty state use natural language", () => {
  assert.match(ask, /type="submit">Send<\/PrimaryButton>/);
  assert.match(ask, /type="button">Conversations<\/button>/);
  assert.match(ask, /<h2[^>]*>Conversations<\/h2>/);
  assert.match(ask, /title="No conversations yet\." text="Questions and things you tell Furvise will show up here\."/);
});

test("the three starter cards retain their exact prompts and geometry contract", () => {
  for (const prompt of ["What has changed recently?", "What should I keep an eye on?", "How should I prepare for {pet}'s next vet visit?"]) assert.match(ask, new RegExp(prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((ask.match(/data-ui="starter-question"/g) || []).length, 1);
  assert.match(ask, /className="group flex min-h-11 min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-\[var\(--assistant-response-border\)\] bg-\[var\(--suggested-question-surface\)\] px-3\.5 py-2\.5 text-left text-sm font-semibold leading-5 text-\[var\(--suggested-question-foreground\)\] transition-colors hover:bg-\[var\(--suggested-question-hover\)\] active:bg-\[var\(--suggested-question-selected\)\] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-\[var\(--pw-focus-ring\)\] sm:w-auto sm:flex-1"/);
  assert.match(ask, /onClick=\{\(\) => onSelect\(label\)\}/);
});

test("Ask scopes primary actions to forest and uses neutral pet selector controls", () => {
  assert.match(css, /\.ask-v1-product-world \{[\s\S]*--action-primary: var\(--deep-forest\);[\s\S]*--text-inverse: var\(--warm-cream\);[\s\S]*--pw-primary: var\(--deep-forest\);[\s\S]*--suggested-question-foreground: var\(--deep-forest\);/);
  assert.match(ask, /ask-v1-product-world contents/);
  assert.match(ask, /border-\[var\(--input-border\)\] bg-\[var\(--input-background\)\]/);
  assert.doesNotMatch(ask, /surface-interactive|warm-orange|#F47A22|#FA8A36|#EF6E17/);
});


test("Furvise-authored Ask prose hides implementation machinery and em dashes", async () => {
  const askModule = await import("../app/lib/ask.mjs");
  const base = { title: "Furvise", summary: "Aster is stable — keep watching appetite.", sections: [], safetyNote: null };
  const parsed = askModule.parseAskResponse(base);
  assert.ok(parsed);
  assert.doesNotMatch(parsed.summary, /—/);
  assert.match(parsed.summary, /stable, keep watching/);
  assert.equal(askModule.parseAskResponse({ ...base, summary: "The provider call exceeded the token budget." }), null);
  assert.equal(askModule.parseAskResponse({ ...base, summary: "The model response failed." }), null);
  const quoted = askModule.parseAskResponse({ ...base, summary: 'Saved wording: "owner wrote — exactly this".' });
  assert.ok(quoted);
  assert.match(quoted.summary, /"owner wrote — exactly this"/);
});

test("Ask footer identifies Furvise rather than implementation technology", () => {
  const notice = read("app/components/beta-feedback-notice.tsx");
  assert.match(notice, /Furvise can make mistakes/);
  assert.doesNotMatch(notice, /AI can make mistakes/);
});
