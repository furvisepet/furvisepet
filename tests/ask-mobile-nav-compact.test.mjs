import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ask = read("app/ask/page.tsx");
const header = read("app/components/app-header.tsx");
const layout = read("app/layout.tsx");
const css = read("app/globals.css");
const navStart = header.indexOf('<nav aria-label="Mobile navigation"');
const nav = header.slice(navStart, header.indexOf("</nav>", navStart) + 6);

test("Ask composer focus explicitly controls only the Ask compact navigation mode", () => {
  assert.match(layout, /<AskComposerFocusProvider>[\s\S]*<AuthenticatedAppChrome \/>[\s\S]*\{children\}[\s\S]*<\/AskComposerFocusProvider>/);
  assert.match(ask, /onFocus=\{\(\) => setComposerFocused\(true\)\}/);
  assert.match(ask, /onBlur=\{\(\) => setComposerFocused\(false\)\}/);
  assert.match(ask, /useEffect\(\(\) => \(\) => setComposerFocused\(false\)/);
  assert.match(header, /const askCompactNavigation = pathname === "\/ask" && composerFocused/);
});

test("normal navigation has labels while focused Ask uses compact icon-only presentation", () => {
  assert.match(nav, /askCompactNavigation \? "sr-only" : "block whitespace-nowrap"/);
  assert.match(nav, /askCompactNavigation \? "h-8 w-10" : "h-10 w-12"/);
  assert.match(nav, /aria-label=\{item\.label\}/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(nav, /grid-cols-5/);
  assert.match(nav, /min-h-11/);
});

test("compact navigation and Ask composer preserve safe-area and complete bottom clearance", () => {
  assert.match(nav, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.match(css, /--mobile-nav-compact-height: 3\.5rem/);
  assert.match(css, /\.app-sticky-composer\[data-ask-composer-focused="true"\][\s\S]*var\(--mobile-nav-compact-height\)[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-expanded-height\)[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(ask, /data-ask-composer-focused=\{composerFocused\}/);
});
