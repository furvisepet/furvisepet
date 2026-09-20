import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage, ReadCoverageStatus } from "./lungs.ts";

export const requiresTemporalHistory = (temporal: ReadTicket["temporal"]) =>
  temporal.anchor !== null || temporal.calendar != null;

type Window = ReadCoverage["windows"][number] & { excludedTime: number | null };
type Resolution = { ok: true; windows: Window[]; anchors: ReadCoverage["anchors"] }
  | { ok: false; status: ReadCoverageStatus; reason: string };

/** Resolve semantic time before predicates or any selector. Each subject owns
 * its anchor; explicit dates intersect that subject's resolved interval.
 * This consumes effective history, never raw candidates or owner prose.
 */
export function resolveReadWindows(ticket: ReadTicket, rows: CareEntryRow[],
  accessibleFrom: number, accessibleTo: number, continuation: ReadCoverage["continuation"],
  uncertainIds: ReadonlySet<string>, matchesAnchor: (row: CareEntryRow, concept: string) => boolean): Resolution {
  const windows: Window[] = [], anchors: ReadCoverage["anchors"] = [];
  for (const petId of ticket.subjects.petIds) {
    let from = Math.max(accessibleFrom, ticket.temporal.from ? Date.parse(ticket.temporal.from) : -Infinity);
    let to = Math.min(accessibleTo, ticket.temporal.to ? Date.parse(ticket.temporal.to) : Infinity);
    let excludedTime: number | null = null;
    const anchor = ticket.temporal.anchor;
    if (anchor) {
      const matches = rows.filter(row => row.pet_profile_id === petId && matchesAnchor(row, anchor.concept));
      if (matches.some(row => uncertainIds.has(row.id))) return { ok: false, status: "partial", reason: "anchor_lineage_unresolved" };
      if (continuation.length) return { ok: false, status: "partial", reason: "anchor_search_not_exhausted" };
      if (matches.length !== 1) return { ok: false, status: "anchor_missing",
        reason: matches.length ? "anchor_ambiguous" : "anchor_not_found" };
      const time = Date.parse(matches[0].occurred_at);
      anchors.push({ petId, eventId: matches[0].id, eventAt: matches[0].occurred_at });
      if (anchor.relation === "before") to = Math.min(to, time);
      else from = Math.max(from, time);
      if (anchor.relation === "after") excludedTime = time;
    }
    if (ticket.temporal.calendar === "oldest_year") {
      if (continuation.length) return { ok: false, status: "partial", reason: "calendar_search_not_exhausted" };
      const times = rows.filter(row => row.pet_profile_id === petId
        && Date.parse(row.occurred_at) >= from && Date.parse(row.occurred_at) < to).map(row => Date.parse(row.occurred_at));
      if (times.length) {
        const year = new Date(Math.min(...times)).getUTCFullYear();
        from = Math.max(from, Date.UTC(year, 0, 1));
        to = Math.min(to, Date.UTC(year + 1, 0, 1));
      }
    }
    windows.push({ petId, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
      relation: anchor?.relation || null, excludedTime });
  }
  return { ok: true, windows, anchors };
}

export function withinReadWindow(row: CareEntryRow, window: Window): boolean {
  const time = Date.parse(row.occurred_at);
  return row.pet_profile_id === window.petId && time >= Date.parse(window.from)
    && time < Date.parse(window.to) && time !== window.excludedTime;
}
