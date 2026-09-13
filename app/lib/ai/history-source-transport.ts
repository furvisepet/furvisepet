import type { EvidenceSource } from "../intelligence/ask-evidence.ts";

/** Lossless grouping of source channels whose IDs are not represented in the
 * prompt. Full identity lists remain in the server contract. Counts, caps and
 * every coverage limitation survive transport; none become absence evidence. */
export function compactHistorySourceCoverage(sources: EvidenceSource[], represented: Set<string>) {
  const direct: EvidenceSource[] = [];
  type Member = Pick<EvidenceSource, "petId" | "source" | "loadedCount" | "cap">;
  type Group = Omit<EvidenceSource, "petId" | "source" | "loadedCount" | "cap"> & { members: Member[] };
  const groups = new Map<string, Group>();
  for (const source of sources) {
    const loadedIds = source.loadedIds.filter(id => represented.has(id));
    if (loadedIds.length) { direct.push({ ...source, loadedIds }); continue; }
    const { petId, source: name, loadedCount, cap, ...coverage } = source;
    const shared = { ...coverage, loadedIds };
    const key = JSON.stringify(shared);
    const group = groups.get(key) || { ...shared, members: [] };
    group.members.push({ petId, source: name, loadedCount, cap });
    groups.set(key, group);
  }
  return { sources: direct, unrepresentedSourceGroups: [...groups.values()] };
}
