import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("global metadata uses the canonical Furvise title and clean description", () => {
  const layout = read("app/layout.tsx");
  const seo = read("app/lib/seo.ts");
  const metadataSource = `${layout}\n${seo}`;

  assert.match(seo, /https:\/\/www\.furvise\.com/);
  assert.match(seo, /Furvise \| Your Pet's Story, Understood Over Time/);
  assert.match(layout, /template: "%s \| Furvise"/);
  assert.match(seo, /questions, changes, routines, and history connected over time/);
  assert.doesNotMatch(seo, /focused AI guidance/);
  assert.doesNotMatch(metadataSource, /launching soon|technology website/i);
  assert.doesNotMatch(metadataSource, /—/);
});

test("home canonical and social metadata use the selected canonical domain", () => {
  const page = read("app/page.tsx");
  const layout = read("app/layout.tsx");
  const seo = read("app/lib/seo.ts");

  assert.match(page, /createPublicPageMetadata/);
  assert.match(page, /path: "\/"/);
  assert.match(seo, /CANONICAL_ORIGIN = "https:\/\/www\.furvise\.com"/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /FURVISE_OG_IMAGE_URL/);
  assert.match(layout, /siteName: "Furvise"/);
});

test("apex and production Vercel alias redirect to the canonical host", () => {
  const config = read("next.config.ts");

  assert.match(config, /type: "host", value: "furvise\.com"/);
  assert.match(config, /type: "host", value: "petwise-nu\.vercel\.app"/);
  assert.equal(
    (config.match(/destination: "https:\/\/www\.furvise\.com\/:path\*"/g) || []).length,
    2,
  );
  assert.equal((config.match(/permanent: true/g) || []).length, 2);
});

test("sitemap includes only existing public indexable routes", () => {
  assert.ok(existsSync(path.join(root, "app/sitemap.ts")));
  const sitemap = read("app/sitemap.ts");

  assert.match(sitemap, /canonicalUrl\(\)/);
  assert.match(sitemap, /canonicalUrl\("\/privacy"\)/);
  assert.match(sitemap, /lastModified/);
  for (const privateRoute of [
    "/dashboard",
    "/pets",
    "/care-log",
    "/care-history",
    "/ask",
    "/login",
    "/onboarding",
    "/results",
    "/account",
    "/shop",
  ]) {
    assert.doesNotMatch(sitemap, new RegExp(`canonicalUrl\\(\"${privateRoute}`));
  }
});

test("robots allows public pages and blocks private and API routes", () => {
  assert.ok(existsSync(path.join(root, "app/robots.ts")));
  const robots = read("app/robots.ts");

  assert.match(robots, /allow: "\/"/);
  for (const route of [
    "/dashboard",
    "/pets",
    "/care-history",
    "/ask",
    "/account",
    "/onboarding",
    "/results",
    "/api",
  ]) {
    assert.match(robots, new RegExp(`\"${route}\"`));
  }
  assert.match(robots, /canonicalUrl\("\/sitemap\.xml"\)/);
});

test("manifest and metadata use only existing approved Furvise brand assets", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const layout = read("app/layout.tsx");
  const seo = read("app/lib/seo.ts");

  assert.equal(manifest.name, "Furvise");
  assert.equal(manifest.short_name, "Furvise");
  assert.equal(manifest.description, "Furvise keeps your pet's questions, changes, routines, and history connected over time.");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ["/favicon.ico", "/android-192.png", "/android-512.png", "/maskable-icon-512.png"],
  );
  assert.equal(existsSync(path.join(root, "public/favicon.svg")), false);
  assert.match(layout, /\/favicon\.ico/);
  assert.match(layout, /favicon-16\.png[\s\S]*favicon-32\.png[\s\S]*apple-touch-icon\.png/);
  assert.match(seo, /\/brand\/furvise-social\.png/);

  for (const asset of [
    "app/favicon.ico",
    "public/brand/furvise-logo.svg",
    "public/brand/furvise-social.png",
    "public/brand/furvise-wordmark.svg",
    "public/brand/furvise-heron.svg",
    "public/favicon-16.png",
    "public/favicon-32.png",
    "public/apple-touch-icon.png",
    "public/android-192.png",
    "public/android-512.png",
    "public/maskable-icon-512.png",
  ]) {
    assert.ok(existsSync(path.join(root, asset)), `${asset} should exist`);
  }
});

test("app UI has no default Next, Vercel, triangle, or house logo references", () => {
  const uiSource = [
    "app/components/app-header.tsx",
    "app/components/homepage-client.tsx",
    "app/components/brand-mark.tsx",
    "app/layout.tsx",
  ]
    .map(read)
    .join("\n");

  assert.doesNotMatch(uiSource, /next\.svg|vercel\.svg|triangle(?:-|_)icon|house(?:-|_)icon/i);
  assert.match(uiSource, /\/brand\/furvise-logo\.svg/);
});

test("private app routes use shared noindex metadata", () => {
  const seo = read("app/lib/seo.ts");
  assert.match(seo, /PRIVATE_PAGE_ROBOTS[\s\S]*index: false[\s\S]*follow: false/);

  for (const route of [
    "account",
    "ask",
    "care-log",
    "dashboard",
    "dogs",
    "forgot-password",
    "login",
    "onboarding",
    "pets",
    "results",
    "shop",
    "update-password",
    "vet-brief",
    "vet-briefs",
  ]) {
    const layout = read(`app/${route}/layout.tsx`);
    assert.match(layout, /createPrivatePageMetadata/);
  }

  const shop = read("app/shop/layout.tsx");
  assert.match(shop, /"Products"/);
  assert.match(shop, /Find food, grooming, dental, and everyday care products/);
});

test("home JSON-LD is limited to WebSite and Organization", () => {
  const page = read("app/page.tsx");
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /"@type": "WebSite"/);
  assert.match(page, /"@type": "Organization"/);
  assert.match(page, /brand\/furvise-logo\.svg/);
  assert.match(page, /description: ORGANIZATION_DESCRIPTION/);
  assert.doesNotMatch(page, /MedicalBusiness|VeterinaryCare|AggregateRating|Review|Offer/);
});
