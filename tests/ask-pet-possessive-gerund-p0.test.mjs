import assert from "node:assert/strict";
import test from "node:test";

import {
  neutralizeMalformedPetReferences,
  normalizePetVisibleAnswer,
  normalizePetVisibleProse,
} from "../app/lib/ask-safety-context.ts";

const profiles = [
  { name: "Mani", sex: "female", species: "cat" },
  { name: "Luna", sex: "female", species: "cat" },
  { name: "Max", sex: "male", species: "dog" },
  { name: "Milo", pronouns: "they/them", species: "cat" },
  { name: "O’Malley", sex: "male", species: "cat" },
  { name: "Nala", sex: null, species: "cat" },
];

const possessiveGerunds = [
  ["Mani", "biting", "has gotten worse"],
  ["Mani", "hiding", "worries me"],
  ["Mani", "pacing", "seems unusual"],
  ["Luna", "scratching", "increased"],
  ["Max", "vomiting", "stopped"],
  ["Milo", "eating", "has improved"],
  ["O’Malley", "grooming", "looks normal"],
  ["Nala", "sleeping", "has changed"],
];

test("valid pet-name possessive gerunds survive every visible-prose normalization path", () => {
  for (const [name, gerund, predicate] of possessiveGerunds) {
    const profile = profiles.find((candidate) => candidate.name === name);
    const source = `${name}’s ${gerund} ${predicate}.`;
    assert.equal(normalizePetVisibleProse(source, profile), source, `${name}/${gerund}`);
    assert.equal(normalizePetVisibleAnswer({ summary: source, sections: [], safetyNote: null }, profile).summary, source, `${name}/${gerund}/answer`);
    assert.equal(neutralizeMalformedPetReferences({ summary: source, sections: [], safetyNote: null }, profile).summary, source, `${name}/${gerund}/validator`);
  }
});

test("trailing-apostrophe possessives remain untouched when a name naturally ends in s", () => {
  const profile = { name: "Mr. Pickles", sex: "male", species: "cat" };
  const source = "Mr. Pickles’ hiding worries me.";
  assert.equal(normalizePetVisibleProse(source, profile), source);
  assert.equal(neutralizeMalformedPetReferences({ summary: source, sections: [], safetyNote: null }, profile).summary, source);
});

test("ambiguous possessive gerunds are preserved for female, male, neutral, and unknown pronouns", () => {
  const cases = [
    [{ name: "Mani", sex: "female", species: "cat" }, "Mani's biting sounds like she is reaching her limit."],
    [{ name: "Max", sex: "male", species: "dog" }, "Max's pacing seems unusual for him."],
    [{ name: "Milo", pronouns: "they/them", species: "cat" }, "Milo's hiding may mean they need space."],
    [{ name: "Nala", sex: null, species: "cat" }, "Nala's scratching has increased."],
  ];
  for (const [profile, source] of cases) {
    assert.equal(normalizePetVisibleProse(source, profile), source);
  }
});

test("natural object and possessive pronouns remain natural", () => {
  const cases = [
    [{ name: "Mani", sex: "female", species: "cat" }, ["pet her", "give her space", "let her choose", "her food"]],
    [{ name: "Max", sex: "male", species: "dog" }, ["pet him", "give him space", "let him choose", "his food"]],
    [{ name: "Milo", pronouns: "they/them", species: "cat" }, ["pet them", "give them space", "let them choose", "their food"]],
  ];
  for (const [profile, phrases] of cases) {
    for (const phrase of phrases) assert.equal(normalizePetVisibleProse(phrase, profile), phrase);
  }
});

test("high-confidence malformed object and finite-verb references are still repaired", () => {
  const cases = [
    [{ name: "Mani", sex: "female", species: "cat" }, "pet Mani’s", "pet her"],
    [{ name: "Mani", sex: "female", species: "cat" }, "give Mani’s space", "give her space"],
    [{ name: "Mani", sex: "female", species: "cat" }, "let Mani’s choose", "let her choose"],
    [{ name: "Max", sex: "male", species: "dog" }, "give Max’s space", "give him space"],
    [{ name: "Milo", pronouns: "they/them", species: "cat" }, "let Milo’s choose", "let them choose"],
    [{ name: "Nala", sex: null, species: "cat" }, "pet Nala’s", "pet Nala"],
  ];
  for (const [profile, source, expected] of cases) {
    assert.equal(normalizePetVisibleProse(source, profile), expected);
  }
});

test("possessive noun phrases still use natural pronouns when name reduction is enabled", () => {
  assert.equal(
    normalizePetVisibleProse("Mani’s food is in Mani’s bowl.", { name: "Mani", sex: "female", species: "cat" }),
    "Her food is in her bowl.",
  );
});
