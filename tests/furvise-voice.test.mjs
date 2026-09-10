import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildUrgentAskResponse } from "../app/lib/ask.mjs";
import {
  FURVISE_CORE_PROMPT_RULES,
  FURVISE_RESPONSE_DEPTH_RULES,
  FURVISE_SHARED_PROMPT_RULES,
  FURVISE_WRITING_PRINCIPLES,
} from "../app/lib/furvise-voice.ts";
import {
  buildFurviseSafetyLine,
  buildMissingSavedInformationMessage,
  buildNoSafeProductMatchMessage,
  FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE,
  FURVISE_MISSING_INGREDIENTS_MESSAGE,
  FURVISE_MISSING_PRICE_MESSAGE,
  FURVISE_MISSING_AVAILABILITY_MESSAGE,
  FURVISE_MISSING_RETAILER_LINK_MESSAGE,
  FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
  FURVISE_PRODUCT_USAGE_CAP_MESSAGE,
  FURVISE_SEARCH_FALLBACK_MESSAGE,
  FURVISE_URGENT_SAFETY_MESSAGE,
} from "../app/lib/furvise-output.ts";

test("central voice module defines and shares the Furvise writing principles", () => {
  for (const principle of ["Direct first", "Efficient, not merely short", "Pet-aware", "Context-aware", "Uncertainty-preserving", "Practical", "Relevance-aware", "Calm", "Human", "Structure when useful", "No internal machinery", "No empty follow-up offers", "No generic safety footer spam", "No em dashes"]) {
    assert.ok(FURVISE_WRITING_PRINCIPLES.some((item) => item.startsWith(`${principle}:`)));
  }
  assert.ok(FURVISE_CORE_PROMPT_RULES.length >= 8);
  assert.ok(FURVISE_RESPONSE_DEPTH_RULES.length >= 5);
  assert.ok(FURVISE_SHARED_PROMPT_RULES.length >= 15);
  assert.equal(buildFurviseSafetyLine("Rocky"), "Based on what you've saved about Rocky. Not a substitute for veterinary or professional advice.");
  assert.equal(buildMissingSavedInformationMessage("Rocky"), "You have not saved anything about that for Rocky yet.");
  assert.equal(buildNoSafeProductMatchMessage("Rocky"), "I could not find a product that fits this search, Rocky's details, and your product country.");
  assert.equal(FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE, "The full product details are not available yet, so check the label before buying or using it.");
  assert.equal(FURVISE_MISSING_INGREDIENTS_MESSAGE, "The full ingredient list is not available yet, so check the package before buying.");
  assert.equal(FURVISE_MISSING_PRICE_MESSAGE, "Check the retailer for the latest price.");
  assert.equal(FURVISE_MISSING_AVAILABILITY_MESSAGE, "Check the retailer for current availability.");
  assert.equal(FURVISE_MISSING_RETAILER_LINK_MESSAGE, "A current retailer link is not available yet.");
  assert.equal(FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE, "Product guidance is temporarily unavailable, but you can still search the catalog.");
  assert.equal(FURVISE_PRODUCT_USAGE_CAP_MESSAGE, "You have used this month's AI credits. Product browsing and matching are still available.");
  assert.equal(FURVISE_SEARCH_FALLBACK_MESSAGE, "I could not fully understand that search, so I looked through the catalog using the words you typed.");
});

test("urgent wording is first and normal product answers avoid unsafe claims", () => {
  const urgent = buildUrgentAskResponse();
  assert.equal(urgent.summary, FURVISE_URGENT_SAFETY_MESSAGE);
  assert.match(urgent.summary, /^This sounds more important than choosing a product\./);
});

test("user-facing app and prompt files contain no em dash character", () => {
  const sourceFiles = listSourceFiles(fileURLToPath(new URL("../app", import.meta.url)));
  for (const file of sourceFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\u2014/, file);
  }
});

function listSourceFiles(root) {
  const files = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...listSourceFiles(path));
    else if (/\.(?:mjs|ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}
