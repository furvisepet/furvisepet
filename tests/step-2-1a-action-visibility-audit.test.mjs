import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const primitives = read("app/components/product-primitives.tsx");
const audit = read("app/components/action-visual-audit.tsx");
const layout = read("app/layout.tsx");
const today = read("app/dashboard/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/care-log-workspace.tsx");

test("shared button labels own an explicit readable foreground in every state", () => {
  const expected = {
    primary: "text-inverse",
    secondary: "secondary-action-text",
    soft: "soft-action-text",
    ghost: "ghost-action-text",
  };

  for (const [variant, token] of Object.entries(expected)) {
    assert.match(primitives, new RegExp(`${variant}: "text-\\[color:var\\(--${token}\\)\\]"`));
  }
  assert.match(primitives, /<span className=\{labelClasses\} data-button-label>\{children\}<\/span>/);
  assert.match(primitives, /group-disabled:text-\[color:var\(--disabled-text\)\]/);
  assert.match(primitives, /group-aria-disabled:text-\[color:var\(--disabled-text\)\]/);
  assert.match(primitives, /text-\[color:var\(--disabled-text\)\][^>]*role="status">Loading/);
});

test("the development visual audit enumerates every requested route and action rule", () => {
  for (const [path, name] of [
    ["/dashboard", "Today"],
    ["/pets", "Pets"],
    ["/care-log", "History"],
    ["/ask", "Ask"],
    ["/shop", "Products"],
    ["/", "Homepage"],
  ]) {
    assert.match(audit, new RegExp(`\\["${path.replaceAll("/", "\\/")}", "${name}"\\]`));
  }

  assert.match(audit, /button, summary, a\.rounded-full, a\[data-button-variant\], a\[data-ui\], a\[role='button'\]/);
  assert.match(audit, /empty accessible name/);
  assert.match(audit, /no visible text and no intentional icon-only label/);
  assert.match(audit, /no recognized shared or semantic action variant/);
  assert.match(audit, /conflicting foreground utilities/);
  assert.match(audit, /enabled control uses disabled styling/);
  assert.match(audit, /disabled label is not visible/);
  assert.match(audit, /console\.assert\(failures\.length === 0/);
  assert.match(layout, /process\.env\.NODE_ENV === "development" \? <ActionVisualAudit \/>/);
});

test("all formerly blank pills preserve their intended labels through shared variants", () => {
  assert.match(history, /<PrimaryButton onClick=\{openCreate\}>Add first update<\/PrimaryButton><SecondaryButton[^>]*>\{emptyHistoryName \? `Ask about \$\{emptyHistoryName\}` : "Ask about your pets"\}<\/SecondaryButton>/);
  assert.match(pets, /<SoftButton href=\{`\/care-log\?pet=\$\{profile\.id\}&new=1`\}>Add update<\/SoftButton><SecondaryButton href=\{`\/ask\?pet=\$\{profile\.id\}`\}>Ask about \{name\}<\/SecondaryButton>/);
  assert.ok(pets.split("<SoftButton href={`/care-log?pet=${profile.id}&new=1`}>Add update</SoftButton>").length - 1 >= 2);
  assert.match(today, /<SecondaryButton href=\{`\/ask\?pet=\$\{encodeURIComponent\(selectedProfile\.id\)\}`\}>Ask about \{petName\}<\/SecondaryButton>/);
});

test("safe page-level pill actions no longer duplicate shared primary or secondary utility stacks", () => {
  assert.match(today, /<PrimaryButton[^>]*disabled=\{!quickEntryDraft \|\| quickSaving\}[^>]*loading=\{quickSaving\}[^>]*type="submit">/);
  assert.doesNotMatch(today, /<button[^>]*bg-\[var\(--action-primary\)\]/);
  assert.match(history, /<SecondaryButton href=\{`\/vet-brief/);
  assert.match(history, /<PrimaryButton[\s\S]*onClick=\{openCreate\}[\s\S]*Add update[\s\S]*<\/PrimaryButton>/);
  assert.doesNotMatch(history, /<button[^>]*bg-\[var\(--pw-primary\)\]/);
});
