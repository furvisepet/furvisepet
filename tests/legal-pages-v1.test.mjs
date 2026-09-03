import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const shell = read("app/components/legal-page-shell.tsx");
const privacy = read("app/privacy/page.tsx");
const terms = read("app/terms/page.tsx");
const legalSources = `${shell}\n${privacy}\n${terms}`;

test("legal pages use a shared editorial shell with accessible reading geometry", () => {
  assert.match(shell, /max-w-\[1120px\]/);
  assert.match(shell, /max-w-\[820px\]/);
  assert.match(shell, /px-5/);
  assert.match(shell, /min-h-11/);
  assert.match(shell, /focus-visible:ring-2/);
  assert.match(shell, /<article/);
  assert.match(shell, /<section/);
  assert.match(shell, /<h1 className="app-page-title/);
  assert.match(shell, /<h2 className="app-section-title/);
  assert.equal((shell.match(/<h1/g) || []).length, 1);
  assert.doesNotMatch(`${privacy}\n${terms}`, /<h1/);
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
  assert.match(privacy, /mailto:furvisepet@gmail\.com/);
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
  assert.match(terms, /PLAN_CAPABILITIES\.plus\.vetPrepExports/);
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
  assert.match(privacy, /Learn what information Furvise uses, how pet and account data support the service, and the controls available to you\./);
  assert.match(terms, /title: "Terms of Use"[\s\S]*path: "\/terms"/);
  assert.match(terms, /Read the terms for using Furvise, including account, AI guidance, membership, and veterinary-care limitations\./);
  assert.match(privacy, /href: "\/terms", label: "Terms"/);
  assert.match(privacy, /href: "\/account", label: "Account settings", signedInOnly: true/);
  assert.match(terms, /href: "\/privacy", label: "Privacy"/);
  assert.match(terms, /href: "\/membership", label: "Membership"/);
  assert.match(privacy, /href: "\/", label: "Home"/);
  assert.match(terms, /href: "\/", label: "Home"/);
});
