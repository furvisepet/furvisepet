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
  assert.match(seo, /Furvise \| Pet Care History, Notes, Products, and Guidance/);
  assert.match(layout, /template: "%s \| Furvise"/);
  assert.match(seo, /focused AI guidance in one private place/);
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

test("manifest and generated icon inventory use only Furvise brand assets", () => {
  const manifest = JSON.parse(read("public/site.webmanifest"));
  const generator = read("scripts/generate-brand-assets.mjs");

  assert.equal(manifest.name, "Furvise");
  assert.equal(manifest.short_name, "Furvise");
  assert.equal(manifest.description, "Pet care history, notes, products, and guidance.");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ["/android-chrome-192x192.png", "/android-chrome-512x512.png"],
  );
  assert.match(generator, /public[\"', ]+, [\"']brand[\"', ]+, [\"']furvise-logo\.png/);
  assert.match(generator, /furvise-og\.png/);
  assert.equal(existsSync(path.join(root, "public/favicon.svg")), false);

  for (const asset of [
    "app/favicon.ico",
    "public/favicon.ico",
    "public/favicon-16x16.png",
    "public/favicon-32x32.png",
    "public/apple-touch-icon.png",
    "public/android-chrome-192x192.png",
    "public/android-chrome-512x512.png",
    "public/brand/furvise-og.png",
  ]) {
    assert.ok(existsSync(path.join(root, asset)), `${asset} should exist`);
  }

  const og = readFileSync(path.join(root, "public/brand/furvise-og.png"));
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
});

test("app UI has no default Next, Vercel, triangle, or house logo references", () => {
  const uiSource = [
    "app/components/app-header.tsx",
    "app/components/homepage-client.tsx",
    "app/layout.tsx",
  ]
    .map(read)
    .join("\n");

  assert.doesNotMatch(uiSource, /next\.svg|vercel\.svg|triangle(?:-|_)icon|house(?:-|_)icon/i);
  assert.match(uiSource, /\/brand\/furvise-logo\.png/);
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
  ]) {
    const layout = read(`app/${route}/layout.tsx`);
    assert.match(layout, /createPrivatePageMetadata/);
  }

  const shop = read("app/shop/layout.tsx");
  assert.match(shop, /"Products"/);
  assert.match(shop, /filters by species, country, and saved avoid ingredients/);
});

test("home JSON-LD is limited to WebSite and Organization", () => {
  const page = read("app/page.tsx");
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /"@type": "WebSite"/);
  assert.match(page, /"@type": "Organization"/);
  assert.match(page, /brand\/furvise-logo\.png/);
  assert.doesNotMatch(page, /MedicalBusiness|VeterinaryCare|AggregateRating|Review|Offer/);
});
