import { rebuildSemanticProjectionsV2 } from "../app/lib/intelligence/v2/projections/rebuild.ts";
import { compareLegacyToV2Rebuild } from "../app/lib/intelligence/v2/projections/audit.ts";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input);
const first = rebuildSemanticProjectionsV2(payload.claims, payload.relations);
const second = rebuildSemanticProjectionsV2([...payload.claims].reverse(), [...payload.relations].reverse());
if (first.bundleHash !== second.bundleHash) throw new Error("PHASE2_REBUILD_HASH_UNSTABLE");
const report = compareLegacyToV2Rebuild({
  imported: payload.imported,
  legacy: payload.legacy,
  rebuild: first,
  orphanLegacySourceRows: payload.orphanLegacySourceRows,
  duplicateLineage: payload.duplicateLineage,
  invalidCrossUserLineage: payload.invalidCrossUserLineage,
});
process.stdout.write(`${JSON.stringify({ ...report, rebuildHashStable: true })}\n`);
