import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const homepage = read("app/components/homepage-client.tsx");
const css = read("app/globals.css");
const release = read("app/release-notes/page.tsx");

test("homepage has only the two requested decorative illustrations and no story CTA routing", () => {
  for (const art of ["heron", "cat"]) assert.equal(homepage.split(`/images/${art}.png`).length - 1, 1);
  assert.doesNotMatch(homepage, /flamingo|hummingbird|StoryAction|resolveStoryAction|loadDogProfilesWithMemories/);
  assert.match(homepage, /aria-hidden="true"><Image alt="" src="\/images\/heron\.png"/);
  assert.match(homepage, /aria-hidden="true"><Image alt="" src="\/images\/cat\.png"/);
  const main = homepage.slice(homepage.indexOf('<main'), homepage.indexOf('</main>'));
  assert.doesNotMatch(main, /href="\/(?:ask|history|pets|today|login)"/);
  assert.match(main, /href="\/release-notes"/);
  assert.match(main, /href="\/contact" target="_blank" rel="noopener noreferrer"/);
});

test("navigation offers public information to visitors and the app to signed-in users", () => {
  assert.match(homepage, /auth\.status === "loading" \? "loading"/);
  assert.match(homepage, /const anonymous = mode === "anonymous"/);
  assert.match(homepage, /aria-label="About Furvise"/);
  for (const label of ["Today", "Pets", "History", "Ask"]) assert.match(homepage, new RegExp(`label: "${label}"`));
  assert.match(homepage, /href=\{NEW_PET_LOGIN_PATH\}>Get started/);
  assert.match(homepage, /<AccountUtility email=\{email\}/);
  assert.match(homepage, /signedIn \? <HomepageMobileNavigation/);
  assert.match(homepage, /aria-label="Furvise updates"/);
});

test("two visual sections share a grid and stack at smaller widths", () => {
  assert.match(css, /\.home-visual \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.home-visual \{ min-height: 0; grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.home-capabilities \{ grid-template-columns: 1fr/);
  assert.doesNotMatch(homepage, /homepage-viewport-stage|data-story-screen/);
  assert.match(homepage, /does not diagnose or replace veterinary care/);
});

test("release notes are public, dated, linkable, and included in discovery", () => {
  assert.match(release, /path: "\/release-notes"/);
  assert.match(release, /<time dateTime="2026-09-15"/);
  assert.match(release, /id="september-15-2026"/);
  assert.match(release, /href="#september-15-2026"/);
  assert.doesNotMatch(release, /getAuthenticatedApiContext|redirect\("\/login/);
  assert.match(read("app/sitemap.ts"), /canonicalUrl\("\/release-notes"\)/);
  assert.match(homepage, /href="\/release-notes">Release notes/);
  assert.match(release, /Answers can be incomplete or wrong/);
});

test("approved Furvise artwork remains byte-for-byte unchanged", () => {
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("public/brand/furvise-wordmark.svg"), "5ce60b7d3134b5aaf00f4a4a799f46443a9eb0fd23b04724a545ad15f7c248b8");
  assert.equal(hash("public/brand/furvise-heron.svg"), "5bc3424afd22bba0391d302494c506455df9ef3a2221525c32a033e8dda0dd0b");
  assert.equal(hash("public/images/heron.png"), "b9ad70d152185b8561015b1697f25fb4d409c241297129229f0c754c61638793");
  assert.equal(hash("public/images/flamingo.png"), "03cd340a13e7cecacfa7631433d817766eb941287eb48c4cfa2ef8093e271a27");
  assert.equal(hash("public/images/goat.png"), "54eb8be2f0c1878e3bd1058510f5d976c7fede2b850d443c091c5dc0d7c76a97");
  assert.equal(hash("public/images/ostrich.png"), "942b88b30f76d8d24e8661d01ecc064a2dd2c35beea126144fd54004b4335f3d");
  assert.equal(hash("public/images/cat.png"), "be7498352c359a0da98b723f8852d5177cd34e8160046bbf4f85a38db9b80d77");
  assert.equal(hash("public/images/deer.png"), "e3d738ddd62940868c6a249a8a41d91169868a71a6fc531f33819e431cca06d5");
  assert.equal(hash("public/images/hummingbird.png"), "6fa625213608a17eb91fd8b20176d4d9497b78c870e959c977fdfe4fa5710276");
  assert.equal(hash("public/images/birds.png"), "0974af9c75fa907081ae03db4cf0f10f7ae31eb805df946a88a47792ba8b594d");
});
