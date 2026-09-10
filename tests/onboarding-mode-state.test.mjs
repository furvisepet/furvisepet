import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("save failures stay on the save error path and never reuse the load error branch", () => {
  const source = read("app/onboarding/page.tsx");
  const saveCatchStart = source.indexOf("} catch (saveFailure) {");
  const saveCatchBlock = source.slice(saveCatchStart, source.indexOf("} finally", saveCatchStart));

  assert.match(saveCatchBlock, /setError\(saveFailure instanceof Error/);
  assert.doesNotMatch(saveCatchBlock, /setProfile|router\.replace/);
});

test("new pet onboarding uses four complete setup steps before direct save", () => {
  const source = read("app/onboarding/page.tsx");
  for (const question of ["Who are we setting up?", "Tell us about your pet", "Anything Furvise should know?", "Finish setting up"]) assert.match(source, new RegExp(question.replace(/[?]/g, "\\?")));
  assert.match(source, /savePetProfileForUser\(profile, user, null\)/);
  assert.match(source, />\{pet\.name\} is ready<\/h1>/);
  assert.match(source, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(source, /Go to Today/);
  assert.doesNotMatch(source, /\/results\?|Profile ready|Get recommendations|Analyze profile/);
});

test("new pet flow keeps only lightweight optional context before creating the pet", () => {
  const source = read("app/onboarding/page.tsx");
  for (const field of ["Weight", "Anything else?"]) assert.match(source, new RegExp(field.replace(/[?]/g, "\\?")));
  for (const removed of ["Current food", "Avoid ingredients", "Monthly care budget", "Main concern"]) assert.doesNotMatch(source, new RegExp(`Field label="${removed}"`));
  assert.match(source, /species[\s\S]*name[\s\S]*ageValue[\s\S]*weightValue/);
  assert.doesNotMatch(source, /PhotoStep|Choose photo/);
});
