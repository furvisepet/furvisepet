import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(read(path).replace(/\r\n/g, "\n")).digest("hex");

const shell = read("app/components/legal-page-shell.tsx");
const privacy = read("app/privacy/page.tsx");
const terms = read("app/terms/page.tsx");
const legalSources = `${shell}\n${privacy}\n${terms}`;

test("legal pages share Today’s header, footer and type scale", () => {
  assert.match(shell, /appPageContainer/);
  assert.match(shell, /max-w-\[840px\]/);
  assert.match(shell, /<PublicPageHeader \/>/);
  assert.match(shell, /<SiteFooter \/>/);
  assert.match(shell, /<PageHeader eyebrow="Legal"/);
  assert.match(shell, /<h2 className="app-section-title"/);
  assert.match(shell, /data-legal-article=""/);
  assert.match(shell, /site-reading-copy/);
  assert.doesNotMatch(`${privacy}\n${terms}`, /<h1/);
});

test("the common header uses the approved full lockup", () => {
  assert.match(read("app/components/app-header.tsx"), /src="\/brand\/furvise-logo\.svg"/);
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
});

test("approved legal content matches the launch membership disclosures", () => {
  assert.equal(hash("app/privacy/page.tsx"), "3aed01db2169275c80a8b47e6a7dc7d9f1c8d2af68369c00cf0db43e710f95b4");
  assert.equal(hash("app/terms/page.tsx"), "11fadb9181b1af62b47a1b8d5755463b3392cb6585a416b0cf5c7b4ff720334a");
});

test("Privacy contains meaningful V1 data, AI, control, and contact sections", () => {
  for (const heading of [
    "INFORMATION YOU GIVE FURVISE",
    "INFORMATION COLLECTED AUTOMATICALLY",
    "HOW FURVISE USES INFORMATION",
    "AI AND PET INFORMATION",
    "HOW INFORMATION IS SHARED",
    "PET DATA AND MULTI-PET ISOLATION",
    "DATA RETENTION",
    "YOUR CONTROLS",
    "ACCOUNT DELETION",
    "CHILDREN",
    "CHANGES TO THIS POLICY",
    "CONTACT",
  ]) {
    assert.match(privacy, new RegExp(heading));
  }
  assert.match(privacy, /Download a copy of your Furvise data/);
  assert.match(privacy, /delete your Furvise account/i);
  assert.match(privacy, /Furvise does not sell personal information/);
  assert.match(privacy, /mailto:supportfurvise@gmail\.com/);
});

test("Terms contains veterinary and AI limits plus the complete V1 section hierarchy", () => {
  for (const heading of [
    "USING FURVISE",
    "FURVISE IS NOT A VETERINARIAN",
    "AI-GENERATED INFORMATION",
    "YOUR ACCOUNT",
    "PET INFORMATION",
    "FREE AND PLUS MEMBERSHIP",
    "BILLING",
    "SERVICE AVAILABILITY",
    "ACCEPTABLE USE",
    "INTELLECTUAL PROPERTY",
    "ACCOUNT SUSPENSION OR TERMINATION",
    "LIMITATION OF SERVICE",
    "CHANGES TO THESE TERMS",
    "CONTACT",
  ]) {
    assert.match(terms, new RegExp(heading));
  }
  assert.match(terms, /does not diagnose or treat/);
  assert.match(terms, /emergency veterinary clinic/);
  assert.match(terms, /AI-generated information can be incomplete, inaccurate, or wrong/);
  assert.match(terms, /does not guarantee that AI-generated information is error-free/);
});

test("membership terms use the production V1 entitlement source of truth", () => {
  assert.match(terms, /FREE_ASK_ALLOWANCE/);
  assert.match(terms, /PLUS_ASK_ALLOWANCE/);
  assert.match(terms, /PLAN_CAPABILITIES\.free\.maxPets/);
  assert.match(terms, /PLAN_CAPABILITIES\.plus\.maxPets/);
  assert.doesNotMatch(terms, /FREE_VET_BRIEF_ALLOWANCE/);
  assert.doesNotMatch(terms, /PLUS_VET_BRIEF_ALLOWANCE/);
  assert.match(terms, /MEMBERSHIP_CANCELLATION_TERMS/);
  assert.match(terms, /Both plans include unlimited care-history logging/);
  assert.doesNotMatch(terms, /VET_BRIEF_USAGE_TERMS/);
  assert.doesNotMatch(terms, /CA\$|5\.49/);
});

test("legal copy omits obsolete product-country and unsupported location claims", () => {
  assert.doesNotMatch(legalSources, /product country|regional product|product availability/i);
  assert.doesNotMatch(legalSources, /precise GPS|browser geolocation|geolocation permission/i);
  assert.doesNotMatch(legalSources, /#C9560C|#F47A22|#FA8A36|#EF6E17|warm-orange|accent-apricot/i);
  assert.doesNotMatch(legalSources, /\u2014/);
});

test("metadata and cross-navigation remain canonical", () => {
  assert.match(privacy, /title: "Privacy"[\s\S]*path: "\/privacy"/);
  assert.match(privacy, /Learn how Furvise uses pet and account information, how that information supports the service, and the controls available to you\./);
  assert.match(terms, /title: "Terms of Use"[\s\S]*path: "\/terms"/);
  assert.match(terms, /Read the terms for using Furvise, including accounts, AI-assisted information, membership, billing, and veterinary-care limitations\./);
  assert.match(privacy, /href: "\/terms", label: "Terms"/);
  assert.match(privacy, /href: "\/account", label: "Account settings", signedInOnly: true/);
  assert.match(terms, /href: "\/privacy", label: "Privacy"/);
  assert.match(terms, /href: "\/membership", label: "Membership"/);
  assert.match(privacy, /href: "\/", label: "Home"/);
  assert.match(terms, /href: "\/", label: "Home"/);
});
