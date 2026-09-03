import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const seo = read("app/lib/seo.ts");
const home = read("app/page.tsx");
const homepage = read("app/components/homepage-client.tsx");
const layout = read("app/layout.tsx");
const privacy = read("app/privacy/page.tsx");
const terms = read("app/terms/page.tsx");
const sitemap = read("app/sitemap.ts");
const robots = read("app/robots.ts");
const manifest = read("public/manifest.webmanifest");

test("homepage metadata defines the category through continuity over time", () => {
  assert.match(seo, /HOME_TITLE = "Furvise \| Your Pet's Story, Understood Over Time"/);
  assert.match(
    seo,
    /Furvise keeps your pet's questions, changes, routines, and history connected over time, so what happened before can inform what matters now\./,
  );
  assert.match(
    seo,
    /An AI that follows your pet's story, not just the latest question\. Furvise keeps important context connected over time\./,
  );
  assert.match(home, /description: HOME_DESCRIPTION[\s\S]*path: "\/"[\s\S]*socialDescription: SOCIAL_DESCRIPTION/);
  assert.match(seo, /CANONICAL_ORIGIN = "https:\/\/www\.furvise\.com"/);
  assert.match(home, /title: \{ absolute: HOME_TITLE \}/);
});

test("homepage JSON-LD keeps supported WebSite and Organization entity claims only", () => {
  assert.match(home, /"@type": "WebSite"[\s\S]*name: "Furvise"[\s\S]*url: canonicalUrl\(\)[\s\S]*description: HOME_DESCRIPTION/);
  assert.match(home, /"@type": "Organization"[\s\S]*name: "Furvise"[\s\S]*url: canonicalUrl\(\)[\s\S]*logo: `\$\{CANONICAL_ORIGIN\}\/brand\/furvise-logo\.svg`[\s\S]*description: ORGANIZATION_DESCRIPTION/);
  assert.match(seo, /ORGANIZATION_DESCRIPTION[\s\S]*pet-care intelligence service[\s\S]*connected over time/);
  assert.doesNotMatch(home, /SoftwareApplication|AggregateRating|Review|founder|employee|address|telephone|sameAs|MedicalOrganization|VeterinaryCare/);
});

test("public metadata uses one canonical domain and a real social card", () => {
  const publicMetadata = `${seo}\n${home}\n${layout}\n${privacy}\n${terms}\n${sitemap}\n${robots}`;
  assert.doesNotMatch(publicMetadata, /https:\/\/(?!www\.furvise\.com)[^"'`\s]*furvise\.com|vercel\.app/);
  assert.match(seo, /FURVISE_OG_IMAGE_PATH = "\/brand\/furvise-social\.png"/);
  assert.match(seo, /width: 1200[\s\S]*height: 630[\s\S]*alt: FURVISE_OG_IMAGE_ALT/);
  assert.match(layout, /url: canonicalUrl\(\)/);
  assert.match(robots, /host: CANONICAL_ORIGIN/);
});

test("the social preview is a 1200 by 630 cream PNG with visible brand content", async () => {
  const imagePath = new URL("../public/brand/furvise-social.png", import.meta.url);
  assert.equal(existsSync(imagePath), true);
  const image = sharp(readFileSync(imagePath));
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, info.channels)], [247, 244, 232, 255]);
  assert.ok(data.some((value, index) => index % info.channels < 3 && value < 100), "card contains forest artwork or text");
});

test("sitemap includes only the three indexable pages with significant update dates", () => {
  assert.match(sitemap, /homepage: "2026-09-03"/);
  assert.match(sitemap, /privacy: "2026-09-03"/);
  assert.match(sitemap, /terms: "2026-09-03"/);
  assert.doesNotMatch(sitemap, /2026-07-24|new Date\(\)/);
  assert.equal((sitemap.match(/canonicalUrl\(/g) || []).length, 3);
  for (const route of ["account", "api", "ask", "history", "membership", "pets", "settings", "today", "vet-brief"]) {
    assert.doesNotMatch(sitemap, new RegExp(`canonicalUrl\\(\"/${route}`));
  }
});

test("robots and page metadata protect every current private or utility route family", () => {
  for (const route of [
    "/account",
    "/api",
    "/ask",
    "/auth",
    "/care-log",
    "/catalog",
    "/dashboard",
    "/dogs",
    "/forgot-password",
    "/history",
    "/login",
    "/membership",
    "/onboarding",
    "/pets",
    "/reset-password",
    "/results",
    "/settings",
    "/shop",
    "/today",
    "/update-password",
    "/vet-brief",
    "/vet-briefs",
  ]) {
    assert.match(robots, new RegExp(`\"${route}\"`));
  }
  assert.match(seo, /PRIVATE_PAGE_ROBOTS[\s\S]*index: false[\s\S]*follow: false[\s\S]*nocache: true/);
  for (const route of ["catalog", "vet-brief", "vet-briefs"]) {
    assert.match(read(`app/${route}/layout.tsx`), /createPrivatePageMetadata/);
  }
  assert.doesNotMatch(robots, /_next|\.css|\.js|static/);
});

test("Privacy and Terms retain canonical indexable metadata with the finalized descriptions", () => {
  assert.match(privacy, /title: "Privacy"[\s\S]*path: "\/privacy"/);
  assert.match(privacy, /Learn how Furvise uses pet and account information, how that information supports the service, and the controls available to you\./);
  assert.match(terms, /title: "Terms of Use"[\s\S]*path: "\/terms"/);
  assert.match(terms, /Read the terms for using Furvise, including accounts, AI-assisted information, membership, billing, and veterinary-care limitations\./);
});

test("indexable content contains no obsolete category positioning or hidden SEO additions", () => {
  const indexable = `${seo}\n${home}\n${homepage}\n${privacy}\n${terms}\n${manifest}`;
  for (const phrase of [
    "track your pet",
    "pet health tracker",
    "daily care notes",
    "all-in-one place",
    "AI-powered",
    "AI pet health",
    "AI vet",
    "online vet",
    "symptom checker",
    "product recommendations",
    "product country",
    "regional product suggestions",
    "journal every",
    "care tracking",
  ]) {
    assert.doesNotMatch(indexable, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(indexable, /hidden SEO|llms\.txt|SoftwareApplication|\u2014/);
});

test("manual SEO follow-up and restrained future strategy are documented", () => {
  const checklist = read("docs/seo-v1-search-console-checklist.md");
  const strategy = read("docs/seo-content-strategy-v1.md");
  for (const url of ["https://www.furvise.com/", "https://www.furvise.com/privacy", "https://www.furvise.com/terms", "https://www.furvise.com/sitemap.xml"]) {
    assert.match(checklist, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(checklist, /Request indexing/);
  assert.match(checklist, /selected canonical/);
  assert.match(strategy, /not a scaled keyword factory/i);
  assert.match(strategy, /Why your pet's history matters before a vet visit/);
  assert.match(strategy, /How Furvise differs from keeping pet notes in your phone/);
});
