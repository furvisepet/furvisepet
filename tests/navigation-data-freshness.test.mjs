import {functionSource} from "./helpers/production-function-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("read-only Ask does not announce pet mutations; existing product freshness stays scoped",async()=>{
 const [ask,route,publication,freshness,revalidation]=await Promise.all([
  text("app/ask/page.tsx"),text("app/api/ask/route.ts"),text("app/lib/intelligence/finalize-ask-publication.ts"),
  text("app/lib/navigation/app-data-freshness.ts"),text("app/lib/intelligence/revalidate-ask-state.ts")]);
 const persist=functionSource(route,"persistReadOnlyAnswer");
 assert.match(persist,/carePersistence:CarePersistenceResult=\{status:"skipped",careEntryIds:\[\],concernIds:\[\]/);
 assert.doesNotMatch(persist,/applicationStateChanged:\s*true|intelligencePersistence|revalidateAskStateViews/);
 assert.doesNotMatch(functionSource(route,"executeAskRequest"),/didPersistEffectiveAskState|revalidateAskStateViews|persistAutomaticCareHistory/);
 assert.match(publication,/dataChanged: applicationStateChanged \|\| didPersistEffectiveAskState/);
 assert.match(revalidation,/"\/dashboard"[^\]]*"\/pets"[^\]]*"\/care-log"/s);assert.doesNotMatch(revalidation,/"\/ask"|"\/shop"/);
 assert.match(ask,/if \(payload\.dataChanged\) markAppDataChanged\(\)/);
 assert.match(freshness,/sessionStorage\.setItem/);assert.match(freshness,/dispatchEvent\(new CustomEvent/);
 assert.doesNotMatch(ask+"\n"+freshness,/window\.location\.reload/);
});

test("Today, Pets, profiles, Remembered Details, and History refetch on a new version", async () => {
  const paths = [
    "app/today/page.tsx",
    "app/pets/page.tsx",
    "app/pets/[id]/page.tsx",
    "app/dogs/[id]/memories/page.tsx",
    "app/components/care-log-workspace.tsx",
  ];
  for (const path of paths) {
    const source = await text(path);
    assert.match(source, /useAppDataVersion\(\)/, path);
    assert.match(source, /\[[^\]]*appDataVersion[^\]]*\]/s, `${path} load dependency`);
  }
});

test("freshness version is stable between mutations, preventing navigation refresh loops", async () => {
  const source = await text("app/lib/navigation/app-data-freshness.ts");
  assert.match(source, /const \[version, setVersion\] = useState\(readAppDataVersion\)/);
  assert.doesNotMatch(source, /setInterval|router\.refresh|location\.reload/);
  assert.equal((source.match(/setItem\(/g) || []).length, 1);
});
