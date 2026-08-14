import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("successful Ask state mutations publish one scoped freshness version", async () => {
  const [ask, route, freshness] = await Promise.all([
    text("app/ask/page.tsx"), text("app/api/ask/route.ts"), text("app/lib/navigation/app-data-freshness.ts"),
  ]);
  assert.match(route, /dataChanged: didPersistEffectiveState/);
  assert.match(route, /revalidatePath\(path\)/);
  assert.match(route, /"\/dashboard"[^\]]*"\/pets"[^\]]*"\/care-log"/s);
  const invalidation = route.slice(route.indexOf("function revalidateAskStateViews"), route.indexOf("function textPayloadValue"));
  assert.doesNotMatch(invalidation, /"\/ask"|"\/shop"/);
  assert.match(ask, /if \(payload\.dataChanged\) markAppDataChanged\(\)/);
  assert.match(freshness, /sessionStorage\.setItem/);
  assert.match(freshness, /dispatchEvent\(new CustomEvent/);
  assert.doesNotMatch(`${ask}\n${freshness}`, /window\.location\.reload/);
});

test("Today, Pets, profiles, Remembered Details, and History refetch on a new version", async () => {
  const paths = [
    "app/dashboard/page.tsx",
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
