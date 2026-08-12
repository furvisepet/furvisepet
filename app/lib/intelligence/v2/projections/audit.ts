import type { V2ShadowRebuild } from "./rebuild.ts";

export type LegacyProjectionSnapshot = {
  historyRows: number;
  activeEpisodes: number;
  resolvedEpisodes: number;
  concerns: number;
  currentStateRows: number;
  activeMemories: number;
};

export function compareLegacyToV2Rebuild(input: {
  imported: { canonical: number; provisional: number; ambiguous: number; unresolved: number };
  legacy: LegacyProjectionSnapshot;
  rebuild: V2ShadowRebuild;
  orphanLegacySourceRows: number;
  duplicateLineage: number;
  invalidCrossUserLineage: number;
}) {
  const activeEpisodes = input.rebuild.episodes.filter((row) => row.status === "active" || row.status === "monitoring").length;
  const resolvedEpisodes = input.rebuild.episodes.filter((row) => row.status === "resolved").length;
  return {
    importedClaimCount: input.imported.canonical + input.imported.provisional + input.imported.ambiguous + input.imported.unresolved,
    ...input.imported,
    agreement: {
      history: agreement(input.legacy.historyRows, input.rebuild.history.length),
      activeEpisodes: agreement(input.legacy.activeEpisodes, activeEpisodes),
      resolvedEpisodes: agreement(input.legacy.resolvedEpisodes, resolvedEpisodes),
      concerns: agreement(input.legacy.concerns, input.rebuild.concerns.length),
      currentState: agreement(input.legacy.currentStateRows, input.rebuild.currentState.length),
      memories: agreement(input.legacy.activeMemories, input.rebuild.memories.length),
    },
    orphanLegacySourceRows: input.orphanLegacySourceRows,
    duplicateLineage: input.duplicateLineage,
    invalidCrossUserLineage: input.invalidCrossUserLineage,
    rebuildHash: input.rebuild.bundleHash,
  };
}

function agreement(legacy: number, shadow: number) {
  return { legacy, shadow, agrees: legacy === shadow, delta: shadow - legacy };
}
