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
  for (const prompt of ["What was {pet}'s earliest recorded weight?", "What was {pet}'s latest recorded weight?", "When did we change {pet}'s food?"]) assert.match(ask, new RegExp(prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
