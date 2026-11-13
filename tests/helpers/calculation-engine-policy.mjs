// Full-algebra engine fixture only. Production remains public-v1 restricted.
 // Public capability regressions import calculation-public-fixture.mjs without
 // this hook and must continue to test the actual disabled product behavior.
 import { readFileSync } from "node:fs";
 import { registerHooks } from "node:module";
 import { fileURLToPath } from "node:url";
 const CALCULATION_ENGINE = "/app/lib/intelligence/calculation-capability.ts";
 const PUBLIC_CAPABILITY = "/app/lib/public-v1-capabilities.ts";
 registerHooks({ load(url, context, next) {
   const loaded = next(url, context);
   const matchesEngine = url.endsWith(CALCULATION_ENGINE);
   const matchesPublicGate = url.endsWith(PUBLIC_CAPABILITY);
   if (!matchesEngine && !matchesPublicGate) return loaded;
   const original = matchesEngine
     ? "!PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS.includes(node.operator)"
     : "calculationExecution: false,";
   const replacement = matchesEngine
     ? "false /* full-algebra engine test only */"
     : "calculationExecution: true, /* full-algebra engine test only */";
   const raw = readFileSync(fileURLToPath(url), "utf8");
   if (raw.split(original).length !== 2) throw Error("ENGINE_POLICY_TEST_SEAM_CHANGED");
   const source = String(loaded.source);
   if (!source.includes(original)) return loaded; // Earlier registered test hook.
   if (source.split(original).length !== 2) throw Error("ENGINE_POLICY_TEST_SEAM_CHANGED");
   return { ...loaded, source: source.replace(original, replacement) };
 } });