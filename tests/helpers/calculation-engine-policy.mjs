// Engine regression suites intentionally exercise the complete algebra, including
 // operators unavailable in the public product. This loader exists ONLY in tests.
 // Public capability tests import calculation-public-fixture.mjs directly and use
 // the real policy. Production has no enablement parameter or environment bypass.
 import { registerHooks } from "node:module";
 registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (!url.endsWith("/app/lib/intelligence/calculation-capability.ts")) return loaded;
  const source = String(loaded.source);
  const original = "!PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS.includes(node.operator)";
  const replacement = "false /* full-algebra engine test only */";
  // Multiple independent fixture imports can register this hook repeatedly.
  if (source.includes(replacement) && !source.includes(original)) return loaded;
  if (source.split(original).length !== 2) throw Error("ENGINE_POLICY_TEST_SEAM_CHANGED");
  return { ...loaded, source: source.replace(original, replacement) };
 } });