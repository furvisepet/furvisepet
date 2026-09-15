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
  return { sources: direct, unrepresentedSourceGroups: [...groups.values()].map(group => {
    if (group.members.length < 2) return group;
    const { members, ...coverage } = group;
    const perPet = new Map<string, Member[]>();
    for (const member of members) perPet.set(member.petId, [...(perPet.get(member.petId) || []), member]);
    const patterns = new Map<string, { petIds: string[]; channels: Array<[string, number, number | null]> }>();
    for (const [petId, rows] of perPet) {
      const channels = rows.map(row => [row.source, row.loadedCount, row.cap] as [string, number, number | null])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const key = JSON.stringify(channels);
      const pattern = patterns.get(key) || { petIds: [], channels };
      pattern.petIds.push(petId); patterns.set(key, pattern);
    }
    // Factor identical channel coverage across pets without dropping a single
    // member, count, cap, or limitation. Single-channel groups keep row form.
    if ([...patterns.values()].some(pattern => pattern.petIds.length > 1 && pattern.channels.length > 1)) {
      return { ...coverage, channelColumns: ["source", "loadedCount", "cap"], memberSets: [...patterns.values()] };
    }
    return { ...coverage, memberColumns: ["petId", "source", "loadedCount", "cap"],
      memberRows: members.map(member => [member.petId, member.source, member.loadedCount, member.cap]) };
  }) };
}
