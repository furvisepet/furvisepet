import type { EpisodeSource, Membership } from "./episode-membership.ts";
import { governedRecordedRole } from "./recorded-provenance.ts";

export type RecordedInventory = {
  version: "ask-recorded-inventory.v1"; ownerId: string; petId: string;
  keys: string[]; from: string | null; to: string | null;
  revision: string; snapshot: string; episodeCount: number;
  careIds: string[]; claimIds: string[]; failures: string[];
};

/** SQL validates all native members at one statement snapshot; no source list
 * or prose for the rest of the register needs to cross the model boundary. */
export function recordedCensus(value: unknown, ownerId: string, petId: string, keys: string[], from: string | null, to: string | null) {
  if (!value || typeof value !== "object") return null;
  const r = value as { version: string; ownerId: string; petId: string; keys: string[]; from: string | null; to: string | null;
    episodeCount: number; sourceCount: number; revision: string; snapshot: string };
  const sameTime = (a: string | null, b: string | null) => b === null ? a === null : typeof a === "string" && Date.parse(a) === Date.parse(b);
  if (r.version !== "ask-native-census.v1" || r.ownerId !== ownerId || r.petId !== petId
    || !Array.isArray(r.keys) || JSON.stringify([...r.keys].sort()) !== JSON.stringify([...keys].sort())
    || !sameTime(r.from,from) || !sameTime(r.to,to)
    || !Number.isSafeInteger(r.episodeCount) || r.episodeCount < 0
    || !Number.isSafeInteger(r.sourceCount) || r.sourceCount < r.episodeCount
    || typeof r.revision !== "string" || !/^[1-9][0-9]{0,18}\.[1-9][0-9]{0,18}$/.test(r.revision)
    || typeof r.snapshot !== "string" || !Number.isFinite(Date.parse(r.snapshot))
    || Math.abs(Date.now()-Date.parse(r.snapshot))>30_000) return null;
  return r;
}

/** This is a database census, not a model-supplied completeness flag. Its
 * semantic obligations are discharged only after every group is validated. */
export function recordedInventory(value: unknown, ownerId: string, petId: string,
  keys: string[], from: string | null, to: string | null): RecordedInventory | null {
  if (!value || typeof value !== "object") return null;
  const r = value as RecordedInventory;
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64
    && v.every(id => typeof id === "string" && id.length > 0) && new Set(v).size === v.length;
  const sameTime = (a: unknown, b: string | null) => b === null ? a === null
    : typeof a === "string" && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  if (r.version !== "ask-recorded-inventory.v1" || r.ownerId !== ownerId || r.petId !== petId
    || !Array.isArray(r.keys) || JSON.stringify([...r.keys].sort()) !== JSON.stringify([...keys].sort())
    || !sameTime(r.from, from) || !sameTime(r.to, to) || !/^[1-9][0-9]{0,18}(?:\.[1-9][0-9]{0,18})?$/.test(r.revision)
    || typeof r.snapshot !== "string" || !Number.isFinite(Date.parse(r.snapshot))
    || Math.abs(Date.now() - Date.parse(r.snapshot)) > 30_000
    || !Number.isSafeInteger(r.episodeCount) || r.episodeCount < 0 || r.episodeCount > 32
    || !ids(r.careIds) || !ids(r.claimIds) || r.careIds.length + r.claimIds.length > 64
    || !Array.isArray(r.failures) || r.failures.length !== 0) return null;
  return structuredClone(r);
}

export function inventoryMembersMatch(r: RecordedInventory, members: Membership[] | null) {
  if (!members) return false;
  const equal = (actual: (string | null)[], expected: string[]) => {
    const ids = actual.filter((id): id is string => id !== null);
    return new Set(ids).size === ids.length && JSON.stringify(ids.sort()) === JSON.stringify([...expected].sort());
  };
  return equal(members.map(m => m.care_entry_id), r.careIds)
    && equal(members.map(m => m.claim_id), r.claimIds);
}

/** Current writer provenance takes precedence, including invalidated null proof.
 * The narrow prose fallback is retained only for the older reader contract. */
export function classifiedRecordedSource(s: EpisodeSource, pet: string, topic: string, members: Membership[]) {
  if (members.some(m => m.care_entry_id === s.id && m.recorded_provenance !== undefined))
    return governedRecordedRole(s, topic, members) !== null;
  const escaped = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const role = members.find(m => s.claim ? m.claim_id === s.claim.id : m.care_entry_id === s.id)?.event_role;
  if (role === "opening" || role === "recurrence") {
    return new RegExp(`^${escaped(pet)} (?:had|started|began) (?:a |an )?(?:new |separate |recurrent )${escaped(topic)} episode[.]?$`, "i").test(s.note);
  }
  return role === "continuation" && new RegExp(`^${escaped(pet)} continued the same ${escaped(topic)} episode[.]?$`, "i").test(s.note);
}
